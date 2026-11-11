export type HanzoQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; levels?: Record<string, string> }
  | { type: string; instructions: string; [key: string]: unknown };

export interface HanzoDecisionRequest {
  model?: string;
  state: Record<string, unknown>;
  questions: Record<string, HanzoQuestion>;
}

export interface HanzoChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
}

export interface HanzoNoulAnswer {
  noul: number;
}

export interface HanzoScoreAnswer {
  score: number;
  probabilities: Record<string, number>;
}

export type HanzoDecisionAnswer = HanzoChoiceAnswer | HanzoNoulAnswer | HanzoScoreAnswer | Record<string, unknown>;

export interface HanzoDecisionResponse {
  answers: Record<string, HanzoDecisionAnswer>;
  routing?: { checkpoint?: string | string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export class HanzoDecisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly actions?: unknown[],
  ) {
    super(message);
    this.name = "HanzoDecisionError";
  }
}

const HANZO_DECISIONS_URL = "https://api.hanzo.ai/v1/decisions";

export async function createHanzoDecision(
  input: HanzoDecisionRequest,
  options: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HanzoDecisionResponse> {
  const apiKey = options.apiKey ?? process.env.HANZO_API_KEY;
  if (!apiKey?.trim()) {
    throw new HanzoDecisionError("HANZO_API_KEY is not configured.", 503, "HANZO_NOT_CONFIGURED");
  }
  if (!input || !isRecord(input.state) || !isRecord(input.questions) || Object.keys(input.questions).length === 0) {
    throw new HanzoDecisionError("A state object and at least one named question are required.", 400, "INVALID_DECISION_INPUT");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(HANZO_DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ model: input.model || "kai", state: input.state, questions: input.questions }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (error) {
    throw new HanzoDecisionError(
      error instanceof Error && error.name === "TimeoutError" ? "Hanzo Decisions request timed out." : "Unable to reach Hanzo Decisions API.",
      502,
      "HANZO_NETWORK_ERROR",
    );
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = isRecord(payload?.error) ? payload.error : {};
    const code = typeof error.code === "string" ? error.code : undefined;
    const message = typeof error.message === "string" ? error.message : `Hanzo Decisions returned HTTP ${response.status}.`;
    const actions = Array.isArray(error.actions) ? error.actions : undefined;
    // Preserve the documented billing/rate-limit refusal statuses for callers.
    const status = response.status === 402 || response.status === 429 ? response.status : 502;
    throw new HanzoDecisionError(message, status, code, actions);
  }
  if (!isRecord(payload) || !isRecord(payload.answers)) {
    throw new HanzoDecisionError("Hanzo Decisions returned an invalid response: answers is missing.", 502, "HANZO_INVALID_RESPONSE");
  }
  return payload as HanzoDecisionResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
