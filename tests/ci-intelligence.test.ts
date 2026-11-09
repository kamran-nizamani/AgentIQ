import { describe, expect, it } from "vitest";
import { durationBetween, identifyAgentWorkflow, ingestWorkflowStepEvidence, summarizeCiHistory, summarizeJob } from "../src/ci-intelligence.js";
import { ingestWorkflowJobSnapshot, ingestWorkflowRunSnapshot, type GitHubWorkflowRunSnapshot } from "../src/github-ci.js";

const run = (over: Partial<GitHubWorkflowRunSnapshot>): GitHubWorkflowRunSnapshot => ({
  id: 1, name: "CI", status: "completed", conclusion: "success", headSha: "aaa", runNumber: 1, event: "push",
  createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:02:00Z", ...over,
});

describe("durations", () => {
  it("computes valid spans and rejects bad ones", () => {
    expect(durationBetween("2026-10-08T00:00:00Z", "2026-10-08T00:01:30Z")).toBe(90_000);
    expect(durationBetween(null, "2026-10-08T00:01:30Z")).toBeNull();
    expect(durationBetween("nope", "2026-10-08T00:01:30Z")).toBeNull();
    expect(durationBetween("2026-10-08T00:02:00Z", "2026-10-08T00:01:00Z")).toBeNull();
  });

  it("adds durations to run and job evidence, flagging the run duration as approximate", () => {
    const r = ingestWorkflowRunSnapshot("o/r", run({}));
    expect(r.data).toMatchObject({ durationMs: 120_000, durationApproximate: true });
    expect(ingestWorkflowRunSnapshot("o/r", run({ status: "in_progress", conclusion: null })).data.durationMs).toBeNull();
    const j = ingestWorkflowJobSnapshot("o/r", 1, { id: 2, name: "t", status: "completed", conclusion: "success", startedAt: "2026-10-08T00:00:00Z", completedAt: "2026-10-08T00:00:45Z" });
    expect(j.data.durationMs).toBe(45_000);
  });
});

describe("step capture", () => {
  const job = {
    id: 9, name: "tests", status: "completed", conclusion: "failure",
    startedAt: "2026-10-08T00:00:00Z", completedAt: "2026-10-08T00:01:00Z",
    steps: [
      { name: "checkout", status: "completed", conclusion: "success", number: 1 },
      { name: "npm test", status: "completed", conclusion: "failure", number: 2 },
      { name: "upload", status: "completed", conclusion: "skipped", number: 3 },
    ],
  };
  it("summarizes a job", () => {
    expect(summarizeJob(job)).toEqual({ durationMs: 60_000, stepCount: 3, failedSteps: ["npm test"], skippedSteps: 1 });
  });
  it("emits one step evidence per step without inventing durations", () => {
    const steps = ingestWorkflowStepEvidence("o/r", 1, job);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatchObject({ kind: "step", data: { name: "npm test", conclusion: "failure", jobId: 9, runId: 1 } });
    expect(steps[1]!.data).not.toHaveProperty("durationMs");
  });
});

describe("agent workflow identification", () => {
  it("matches by branch prefix, name, path and actor, and explains why", () => {
    expect(identifyAgentWorkflow(run({ branch: "claude/fix-login" }))).toEqual({ isAgentWorkflow: true, signals: ["branch:claude/"] });
    expect(identifyAgentWorkflow(run({ name: "Copilot coding agent" })).signals).toContain("name:copilot");
    expect(identifyAgentWorkflow(run({ workflowPath: ".github/workflows/codex-review.yml" })).isAgentWorkflow).toBe(true);
    expect(identifyAgentWorkflow(run({ actor: "devin" })).signals).toContain("actor:devin");
  });
  it("does not match ordinary runs or substrings inside other words", () => {
    expect(identifyAgentWorkflow(run({ name: "CI", branch: "main", actor: "alice" }))).toEqual({ isAgentWorkflow: false, signals: [] });
    expect(identifyAgentWorkflow(run({ name: "Precursor build" })).isAgentWorkflow).toBe(false);
  });
  it("accepts custom markers", () => {
    expect(identifyAgentWorkflow(run({ branch: "acme-bot/x" }), { extraBranchPrefixes: ["acme-bot/"] }).isAgentWorkflow).toBe(true);
  });
});

describe("CI history", () => {
  it("summarizes success rate, retries, durations and per-workflow stats", () => {
    const s = summarizeCiHistory([
      run({ id: 1, conclusion: "success" }),
      run({ id: 2, conclusion: "failure", headSha: "bbb" }),
      run({ id: 3, conclusion: "cancelled", headSha: "ccc" }),
      run({ id: 4, status: "in_progress", conclusion: null, headSha: "ddd" }),
      run({ id: 5, name: "Lint", conclusion: "success", runAttempt: 2, headSha: "eee" }),
    ]);
    expect(s).toMatchObject({ totalRuns: 5, completedRuns: 4, succeeded: 2, failed: 1, cancelled: 1, inProgress: 1, retriedRuns: 1 });
    expect(s.successRate).toBeCloseTo(2 / 3);
    expect(s.averageDurationMs).toBe(120_000);
    expect(s.byWorkflow.find((w) => w.workflow === "CI")).toMatchObject({ runs: 4, succeeded: 1, failed: 1 });
  });

  it("flags a commit that failed then passed on rerun as suspected flaky", () => {
    const s = summarizeCiHistory([
      run({ id: 1, headSha: "flaky", conclusion: "failure", runAttempt: 1, runNumber: 7 }),
      run({ id: 1, headSha: "flaky", conclusion: "success", runAttempt: 2, runNumber: 7 }),
      run({ id: 2, headSha: "steady", conclusion: "success" }),
    ]);
    expect(s.suspectedFlakyCommits).toEqual(["flaky"]);
  });

  it("does not flag a pass followed by a later failure, and handles empty input", () => {
    expect(summarizeCiHistory([
      run({ headSha: "x", conclusion: "success", runAttempt: 1 }),
      run({ headSha: "x", conclusion: "failure", runAttempt: 2 }),
    ]).suspectedFlakyCommits).toEqual([]);
    expect(summarizeCiHistory([])).toMatchObject({ totalRuns: 0, successRate: null, averageDurationMs: null, byWorkflow: [] });
  });
});
