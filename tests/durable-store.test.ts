import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveRunRecord } from "../server/github-live.js";
import { durableStorageConfigured, listStoredRunSummaries, saveRunSummaries, saveRunDetail, getStoredRunDetail } from "../server/durable-store.js";

const summary = {
  runId: "123",
  repository: "kamran-nizamani/AgentIQ",
  score: 90,
  grade: "A",
  outcome: "success",
  storedAt: "2026-10-11T00:00:00.000Z",
  evidenceCount: 2,
  riskCount: 0,
  agent: "GitHub Actions",
  task: "CI",
  durationMs: 1200,
  url: "https://github.com/kamran-nizamani/AgentIQ/actions/runs/123",
  branch: "main",
  commitSha: "abc123",
  workflow: "CI",
  event: "push",
  status: "completed",
  conclusion: "success",
  runNumber: 3,
  tests: { total: 4, passed: 4, failed: 0 },
  changes: { filesChanged: 1, linesAdded: 2, linesDeleted: 1 },
  breakdown: { outcome: 100, tests: 100, efficiency: 90, autonomy: 100, safety: 100 },
  recommendations: [],
  evidenceKinds: ["workflow-run"],
  testEvidenceAvailable: true,
  diffEvidenceAvailable: false,
  riskAssessment: "not-assessed",
} as LiveRunRecord;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Supabase durable storage adapter", () => {
  it("is safely disabled when server-side credentials are absent", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(durableStorageConfigured()).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await saveRunSummaries("kamran-nizamani/AgentIQ", [summary]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("upserts summaries using repository and run identity with server credentials", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveRunSummaries("kamran-nizamani/AgentIQ", [summary]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/v1/agentiq_run_summaries?on_conflict=repository%2Crun_id");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-service-role-key");
    expect(JSON.parse(String(init.body))[0]).toMatchObject({ run_id: "123", repository: "kamran-nizamani/AgentIQ" });
  });

  it("reads archive pagination totals and returns stored summaries", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ summary, stored_at: summary.storedAt }]), {
      status: 200, headers: { "content-range": "0-0/42" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listStoredRunSummaries({ repository: "kamran-nizamani/AgentIQ", limit: 20, offset: 0 });
    expect(result.total).toBe(42);
    expect(result.data[0].runId).toBe("123");
    expect(String(fetchMock.mock.calls[0][0])).toContain("limit=20&offset=0");
  });

  it("stores and retrieves detailed evidence snapshots", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const detail = { runId: "123", evidence: { evidence: [] }, jobs: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ detail }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveRunDetail("kamran-nizamani/AgentIQ", "123", detail);
    expect(await getStoredRunDetail("kamran-nizamani/AgentIQ", "123")).toEqual(detail);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
