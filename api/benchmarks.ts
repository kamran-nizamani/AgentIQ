import type { IncomingMessage, ServerResponse } from "node:http";
import { compareControlledBenchmarks, type ControlledBenchmarkRun } from "../src/controlled-benchmark.js";

const MAX_BODY_BYTES = 1_000_000;
const MAX_RUNS = 500;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declaredLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("Request body exceeds the 1 MB limit.");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds the 1 MB limit.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must contain valid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported." } });
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !Array.isArray(body.runs)) {
      sendJson(res, 400, { error: { code: "INVALID_BENCHMARK_INPUT", message: "Send a JSON object with a runs array." } });
      return;
    }
    if (body.runs.length < 1 || body.runs.length > MAX_RUNS) {
      sendJson(res, 400, { error: { code: "INVALID_BENCHMARK_INPUT", message: "runs must contain between 1 and 500 records." } });
      return;
    }
    if (!body.runs.every((run) => isRecord(run) && isRecord(run.evaluation))) {
      sendJson(res, 400, { error: { code: "INVALID_BENCHMARK_INPUT", message: "Every run must be an object with an evaluation object." } });
      return;
    }

    const comparisons = compareControlledBenchmarks(body.runs as unknown as ControlledBenchmarkRun[]);
    sendJson(res, 200, {
      data: {
        comparisons,
        cohortCount: comparisons.length,
        runCount: body.runs.length,
        generatedAt: new Date().toISOString(),
        persisted: false,
        methodology: "Descriptive comparison only; matching task, repository, base commit, test suite, environment, and scoring policy are required.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compare benchmark runs.";
    const tooLarge = message.includes("1 MB limit");
    sendJson(res, tooLarge ? 413 : 400, {
      error: {
        code: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BENCHMARK_INPUT",
        message,
      },
    });
  }
}
