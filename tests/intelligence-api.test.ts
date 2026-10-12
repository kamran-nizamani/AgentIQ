import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import handler from "../api/intelligence.js";

type CapturedResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string | number): void;
  end(body?: string): void;
};

function responseCapture(): CapturedResponse {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = String(value); },
    end(body = "") { this.body = body; },
  };
}

function githubResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const repoFixture = {
  id: 123,
  name: "repo",
  full_name: "owner/repo",
  html_url: "https://github.com/owner/repo",
  description: "Test repository",
  private: false,
  archived: false,
  default_branch: "main",
  language: "TypeScript",
  stargazers_count: 3,
  forks_count: 1,
  open_issues_count: 2,
  pushed_at: "2026-10-12T05:00:00Z",
  license: { name: "MIT License", spdx_id: "MIT" },
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2026-10-12T05:00:00Z",
};

function installGitHubMock() {
  const mock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path === "/repos/owner/repo") return githubResponse(repoFixture);
    if (path === "/repos/owner/repo/actions/runs") {
      return githubResponse({ total_count: 1, workflow_runs: [{ id: 10, name: "CI", html_url: "https://github.com/owner/repo/actions/runs/10", status: "completed", conclusion: "success", created_at: "2026-10-12T05:00:00Z", head_branch: "main", run_number: 1 }] });
    }
    if (path === "/repos/owner/repo/pulls") return githubResponse([]);
    if (path === "/repos/owner/repo/issues") return githubResponse([]);
    if (path === "/repos/owner/repo/contents") return githubResponse([{ name: "README.md", type: "file", path: "README.md" }, { name: "LICENSE", type: "file", path: "LICENSE" }, { name: "tests", type: "dir", path: "tests" }]);
    if (path === "/repos/owner/repo/readme") return githubResponse({ name: "README.md", content: "dGVzdA==", encoding: "base64" });
    if (path === "/repos/owner/repo/dependabot/alerts") return githubResponse({ message: "Resource not accessible by integration" }, 403);
    if (path === "/repos/missing/repo") return githubResponse({ message: "Not Found" }, 404);
    return githubResponse({ message: "Not Found" }, 404);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function callHandler(url: string) {
  const req = { method: "GET", url } as unknown as IncomingMessage;
  const res = responseCapture();
  await handler(req, res as unknown as ServerResponse);
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body) as any };
}

afterEach(() => vi.unstubAllGlobals());

describe("Engineering Intelligence API", () => {
  it("keeps inaccessible dependency alerts unknown and renormalizes health over available evidence", async () => {
    installGitHubMock();
    const result = await callHandler("/api/intelligence?repo=owner%2Frepo");
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    const repo = result.body.data[0].data;
    expect(repo.health).toMatchObject({ score: 100, coverage: 75 });
    expect(repo.security).toMatchObject({ available: false, openCount: null });
    expect(repo.health.components.find((item: { key: string }) => item.key === "security").score).toBeNull();
    expect(repo.security.note).toContain("unknown, not zero vulnerabilities");
  });

  it("returns partial results when one repository is inaccessible", async () => {
    installGitHubMock();
    const result = await callHandler("/api/intelligence?repo=owner%2Frepo&repo=missing%2Frepo");
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(2);
    expect(result.body.data[0].ok).toBe(true);
    expect(result.body.data[1]).toMatchObject({ ok: false, input: "missing/repo", error: { code: "NOT_FOUND" } });
  });

  it("rejects non-GitHub repository URLs without making outbound requests", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const result = await callHandler("/api/intelligence?repo=https%3A%2F%2Fexample.com%2Fowner%2Frepo");
    expect(result.status).toBe(200);
    expect(result.body.data[0]).toMatchObject({ ok: false, error: { code: "INSPECTION_FAILED" } });
    expect(mock).not.toHaveBeenCalled();
  });
});
