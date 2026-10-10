import { describe, expect, it } from "vitest";
import { normalizeWorkflowRun, type GitHubRunApi } from "../server/github-live.js";

const fixture: GitHubRunApi = {
  id: 123456,
  name: "CI",
  status: "completed",
  conclusion: "success",
  head_sha: "abc123",
  run_number: 12,
  event: "pull_request",
  head_branch: "feature/example",
  created_at: "2026-10-10T10:00:00.000Z",
  updated_at: "2026-10-10T10:02:00.000Z",
  run_started_at: "2026-10-10T10:00:10.000Z",
  run_attempt: 1,
  path: ".github/workflows/ci.yml",
  html_url: "https://github.com/kamran-nizamani/AgentIQ/actions/runs/123456",
};

describe("live GitHub Actions normalization", () => {
  it("creates a deterministic evidence-based score for a successful workflow", () => {
    const result = normalizeWorkflowRun("kamran-nizamani/AgentIQ", fixture);
    expect(result.runId).toBe("123456");
    expect(result.outcome).toBe("success");
    expect(result.tests.total).toBe(0);
    expect(result.testEvidenceAvailable).toBe(false);
    expect(result.diffEvidenceAvailable).toBe(false);
    expect(result.riskAssessment).toBe("not-assessed");
    expect(result.score).toBeGreaterThan(0);
    expect(result.evidenceKinds).toEqual(["workflow-run"]);
  });

  it("does not report a failed workflow as successful", () => {
    const result = normalizeWorkflowRun("kamran-nizamani/AgentIQ", { ...fixture, conclusion: "failure" });
    expect(result.outcome).toBe("failure");
    expect(result.score).toBeLessThan(70);
  });

  it("includes real job evidence and steps when supplied", () => {
    const result = normalizeWorkflowRun("kamran-nizamani/AgentIQ", fixture, [{
      id: 99,
      name: "test",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-10T10:00:10.000Z",
      completed_at: "2026-10-10T10:01:50.000Z",
      runner_name: "GitHub Actions",
      steps: [{ name: "Run tests", status: "completed", conclusion: "success", number: 1 }],
      html_url: "https://github.com/kamran-nizamani/AgentIQ/actions/runs/123456/job/99",
    }]);
    expect(result.evidenceKinds).toEqual(["workflow-run", "workflow-job"]);
    expect(result.evidenceCount).toBe(2);
  });
});
