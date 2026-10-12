import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import handler from "../api/benchmarks.js";

function request(body: unknown, method = "POST", contentLength?: string): IncomingMessage {
  const req = Readable.from([typeof body === "string" ? body : JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, { method, url: "/api/benchmarks", headers: contentLength ? { "content-length": contentLength } : {} });
  return req;
}

function response() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
    end: vi.fn(),
  };
  return { res: res as unknown as ServerResponse, headers, output: () => JSON.parse(String(res.end.mock.calls[0]?.[0] ?? "{}")) as Record<string, unknown>, status: () => res.statusCode };
}

const validRun = {
  runId: "run-1",
  agentId: "agent-a",
  modelId: "model-a",
  configId: "default",
  taskId: "task-1",
  repository: "owner/repo",
  baseCommitSha: "abcdef1234567",
  testSuiteVersion: "v1",
  environmentFingerprint: "node22-linux",
  policyVersion: "v1",
  taskOutcome: "success",
  evaluation: { score: 82 },
};

describe("POST /api/benchmarks", () => {
  it("returns controlled comparisons without persisting submitted runs", async () => {
    const { res, headers, output, status } = response();
    await handler(request({ runs: [validRun] }), res);
    expect(status()).toBe(200);
    expect(headers["Cache-Control"]).toBe("no-store");
    expect((output().data as { persisted: boolean }).persisted).toBe(false);
    expect((output().data as { runCount: number }).runCount).toBe(1);
  });

  it("rejects requests with the wrong method", async () => {
    const { res, headers, status } = response();
    await handler(request({ runs: [validRun] }, "GET"), res);
    expect(status()).toBe(405);
    expect(headers.Allow).toBe("POST");
  });

  it("rejects malformed payloads and duplicate run IDs", async () => {
    const malformed = response();
    await handler(request({ nope: [] }), malformed.res);
    expect(malformed.status()).toBe(400);

    const duplicate = response();
    await handler(request({ runs: [validRun, validRun] }), duplicate.res);
    expect(duplicate.status()).toBe(400);
    expect(JSON.stringify(duplicate.output())).toContain("Duplicate runId");
  });

  it("rejects oversized requests before parsing their body", async () => {
    const { res, status, output } = response();
    await handler(request({}, "POST", "1000001"), res);
    expect(status()).toBe(413);
    expect(JSON.stringify(output())).toContain("1 MB limit");
  });
});
