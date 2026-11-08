import { describe, expect, it } from "vitest";
import { GitHubApiCollector } from "../src/github-api.js";
import { collectGitHubIntelligence, type GitHubCollector } from "../src/github-collector.js";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function fixtureFetch(overrides: Record<string, () => Response> = {}) {
  const prJson = { number: 7, title: "Add login", state: "closed", merged_at: "2026-10-08T05:00:00Z", base: { sha: "base" }, head: { sha: "head" }, additions: 60, deletions: 5, changed_files: 3, created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T05:00:00Z", labels: [{ name: "agent" }], draft: false, user: { login: "claude-bot" }, merged_by: { login: "maint" } };
  const routes: Array<[string, () => Response]> = [
    ["/actions/runs/42/jobs", () => json({ jobs: [{ id: 9, name: "tests", status: "completed", conclusion: "success", started_at: "2026-10-08T00:10:00Z", completed_at: "2026-10-08T00:11:00Z", steps: [{ name: "npm test", status: "completed", conclusion: "success", number: 1 }] }] })],
    ["/actions/runs?", () => json({ workflow_runs: [{ id: 42, name: "CI", status: "completed", conclusion: "success", head_sha: "head", run_number: 8, event: "pull_request", head_branch: "claude/login", created_at: "2026-10-08T00:10:00Z", updated_at: "2026-10-08T00:20:00Z", triggering_actor: { login: "claude-bot" } }] })],
    ["/pulls/7/reviews", () => json([{ id: 3, user: { login: "maint" }, state: "APPROVED", submitted_at: "2026-10-08T03:00:00Z", body: "ok" }])],
    ["/pulls/7/comments", () => json([{ id: 4, user: { login: "maint" }, body: "nit", created_at: "2026-10-08T02:00:00Z", path: "src/auth/login.ts", line: 3 }])],
    ["/pulls/7/files", () => json([{ filename: "src/auth/login.ts", status: "added", additions: 50, deletions: 0 }, { filename: "src/util.ts", status: "modified", additions: 10, deletions: 5 }, { filename: "README.md", status: "modified", additions: 0, deletions: 0 }])],
    ["/issues/7/events", () => json([{ id: 1, event: "reopened", created_at: "2026-10-08T01:00:00Z", actor: { login: "maint" } }])],
    ["/pulls?", () => json([prJson])],
    ["/commits?", () => json([{ sha: "head", commit: { message: "login", author: { name: "bot", date: "2026-10-07T23:00:00Z" } } }])],
    ["/repos/o/r", () => json({ full_name: "o/r", default_branch: "main" })],
  ];
  return async (url: string | URL | Request) => {
    const u = String(url);
    for (const [needle, handler] of Object.entries(overrides)) if (u.includes(needle)) return handler();
    const hit = routes.find(([needle]) => u.includes(needle));
    if (!hit) throw new Error("unexpected URL " + u);
    return hit[1]();
  };
}

describe("GitHubApiCollector additions", () => {
  it("parses PR labels, draft flag, author and merger", async () => {
    const c = new GitHubApiCollector("o/r", { fetchImpl: fixtureFetch() });
    expect((await c.pullRequests(1))[0]).toMatchObject({ labels: ["agent"], draft: false, author: "claude-bot", mergedBy: "maint", merged: true });
  });
  it("lists PR files and events, and parses the run actor", async () => {
    const c = new GitHubApiCollector("o/r", { fetchImpl: fixtureFetch() });
    expect(await c.pullRequestFiles(7)).toHaveLength(3);
    expect(await c.pullRequestEvents(7)).toMatchObject([{ event: "reopened", actor: "maint" }]);
    expect((await c.workflowRuns(1))[0]).toMatchObject({ actor: "claude-bot", branch: "claude/login" });
  });
});

describe("collectGitHubIntelligence", () => {
  it("collects CI history, jobs, steps, reviews, comments, diff analysis and lifecycle together", async () => {
    const c = new GitHubApiCollector("o/r", { fetchImpl: fixtureFetch() });
    const r = await collectGitHubIntelligence(c);
    expect(r.warnings).toEqual([]);

    const kinds = new Set(r.bundle.evidence.map((e) => e.kind));
    for (const kind of ["repository", "commit", "pull-request", "workflow-run", "workflow-job", "step", "review", "comment", "diff"]) expect(kinds).toContain(kind);

    expect(r.agentRuns).toMatchObject([{ runId: 42, signals: expect.arrayContaining(["branch:claude/", "actor:claude"]) }]);
    expect(r.ci).toMatchObject({ totalRuns: 1, succeeded: 1, successRate: 1 });

    const diff = r.bundle.evidence.find((e) => e.kind === "diff")!;
    expect(diff.data).toMatchObject({ authFiles: ["src/auth/login.ts"], untestedSourceChange: true, filesChanged: 3 });

    expect(r.pullRequests[0]).toMatchObject({ pullRequest: 7, decision: "approved", reopenCount: 1, mergeStatus: "merged", inlineCommentCount: 1 });
    expect(r.pullRequests[0]!.ci.succeeded).toBe(1);
  });

  it("keeps going and records warnings when an optional resource fails", async () => {
    const c = new GitHubApiCollector("o/r", {
      fetchImpl: fixtureFetch({ "/pulls/7/reviews": () => new Response(JSON.stringify({ message: "Resource not accessible" }), { status: 403 }) }),
    });
    const r = await collectGitHubIntelligence(c);
    expect(r.warnings.join("\n")).toMatch(/reviews for PR #7: Resource not accessible/);
    expect(r.bundle.evidence.some((e) => e.kind === "diff")).toBe(true);
    expect(r.pullRequests).toHaveLength(1);
  });

  it("works with a minimal collector that only has the base methods", async () => {
    const minimal: GitHubCollector = {
      repository: async () => ({ fullName: "o/r", defaultBranch: "main" }),
      commits: async () => [],
      pullRequests: async () => [{ number: 1, title: "t", state: "open", merged: false, baseSha: "a", headSha: "b", additions: 0, deletions: 0, changedFiles: 0, createdAt: "2026-10-08T00:00:00Z" }],
    };
    const r = await collectGitHubIntelligence(minimal);
    expect(r.warnings).toEqual([]);
    expect(r.ci.totalRuns).toBe(0);
    expect(r.pullRequests[0]!.missingStages).toEqual(expect.arrayContaining(["commit", "ci", "review"]));
  });

  it("respects the detail limits", async () => {
    const c = new GitHubApiCollector("o/r", { fetchImpl: fixtureFetch() });
    const r = await collectGitHubIntelligence(c, { maxPullRequestsDetailed: 0, maxRunsWithJobs: 0 });
    expect(r.pullRequests).toEqual([]);
    expect(r.bundle.evidence.some((e) => e.kind === "workflow-job" || e.kind === "review")).toBe(false);
  });
});
