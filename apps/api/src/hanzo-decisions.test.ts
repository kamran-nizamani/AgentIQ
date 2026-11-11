import { afterEach, describe, expect, it, vi } from "vitest";
import { createHanzoDecision, HanzoDecisionError } from "./hanzo-decisions.js";

const input = {
  state: { customer: "Acme Corp", plan: "Enterprise", message: "502 errors since 14:00 UTC" },
  questions: {
    team: {
      type: "choice",
      instructions: "Which team should be alerted?",
      criteria: {
        infrastructure: "network, gateway, latency, outages, 502/504 errors",
        billing: "invoices, payment methods, credit card charges",
        developer_support: "SDK usage, documentation questions, sample code",
      },
    },
    critical: { type: "noul", instructions: "Is this issue critical enough to page on-call engineers?" },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("Hanzo Decisions client", () => {
  it("sends the kai decision request with a bearer token and returns typed answers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      answers: {
        team: { choice: "infrastructure", probabilities: { infrastructure: 0.98, billing: 0.01, developer_support: 0.01 } },
        critical: { noul: 0.94 },
      },
      routing: { checkpoint: "team,critical" },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await createHanzoDecision(input, { apiKey: "test-secret", fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.hanzo.ai/v1/decisions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "kai", state: input.state, questions: input.questions });
    expect(result.answers.team).toMatchObject({ choice: "infrastructure" });
    expect(result.answers.critical).toMatchObject({ noul: 0.94 });
    expect(result.routing?.checkpoint).toBe("team,critical");
  });

  it("uses an explicitly supplied model", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ answers: {} }), { status: 200 }));
    await createHanzoDecision({ ...input, model: "kai" }, { apiKey: "test-secret", fetchImpl: fetchMock });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).model).toBe("kai");
  });

  it.each([402, 429])("preserves %s refusal status and structured error actions", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code: status === 402 ? "INSUFFICIENT_CREDITS" : "RATE_LIMITED", message: "Request refused", actions: ["Check account"] },
    }), { status }));
    await expect(createHanzoDecision(input, { apiKey: "test-secret", fetchImpl: fetchMock }))
      .rejects.toMatchObject({ status, code: status === 402 ? "INSUFFICIENT_CREDITS" : "RATE_LIMITED", actions: ["Check account"] });
  });

  it("fails clearly when the API key is missing", async () => {
    await expect(createHanzoDecision(input, { apiKey: "" })).rejects.toBeInstanceOf(HanzoDecisionError);
  });

  it("rejects missing state or questions before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(createHanzoDecision({ state: {}, questions: {} }, { apiKey: "test-secret", fetchImpl: fetchMock }))
      .rejects.toMatchObject({ status: 400, code: "INVALID_DECISION_INPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed successful responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(createHanzoDecision(input, { apiKey: "test-secret", fetchImpl: fetchMock }))
      .rejects.toMatchObject({ status: 502, code: "HANZO_INVALID_RESPONSE" });
  });
});
