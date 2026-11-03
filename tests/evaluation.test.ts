import { describe, expect, it } from "vitest";
import { createEvidenceBundle, ingestGitDiffEvidence, ingestGitHubActionsRun, ingestTestEvidence } from "../src/ingestion.js";
import { evaluateEvidence } from "../src/evaluation.js";

const run = {
  id: "run-1",
  taskOutcome: "success" as const,
  tests: { total: 0, passed: 0, failed: 0 },
  changes: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
  execution: { durationMs: 60_000 },
  humanIntervention: { required: false, interventions: 0 },
  rollback: false,
};

function workflowEvidence() {
  return ingestGitHubActionsRun({
    runId: 1,
    workflowName: "CI",
    status: "completed",
    conclusion: "success",
    repository: "owner/repo",
    commitSha: "abc123",
  })[0];
}

describe("evidence-aware evaluation", () => {
  it("rejects invalid evaluation policies before calculating a score", () => {
    const evidence = createEvidenceBundle([workflowEvidence()]);
    const invalidPolicies = [
      { id: "negative", outcomeWeight: -0.1, testsWeight: 0.3, efficiencyWeight: 0.4, autonomyWeight: 0.2, safetyWeight: 0.2 },
      { id: "infinite", outcomeWeight: Number.POSITIVE_INFINITY, testsWeight: 0.3, efficiencyWeight: 0.2, autonomyWeight: 0.2, safetyWeight: 0.3 },
      { id: "nan", outcomeWeight: Number.NaN, testsWeight: 0.3, efficiencyWeight: 0.2, autonomyWeight: 0.2, safetyWeight: 0.3 },
      { id: "wrong-sum", outcomeWeight: 0.2, testsWeight: 0.2, efficiencyWeight: 0.2, autonomyWeight: 0.2, safetyWeight: 0.1 },
      { id: "zero-sum", outcomeWeight: 0, testsWeight: 0, efficiencyWeight: 0, autonomyWeight: 0, safetyWeight: 0 },
      { id: "   ", outcomeWeight: 0.35, testsWeight: 0.3, efficiencyWeight: 0.15, autonomyWeight: 0.1, safetyWeight: 0.1 },
    ];

    for (const policy of invalidPolicies) {
      expect(() => evaluateEvidence(evidence, run, policy)).toThrow();
    }
  });

  it("accepts zero-weight dimensions when the remaining weights sum to one", () => {
    const report = evaluateEvidence(createEvidenceBundle([workflowEvidence()]), run, {
      id: "outcome-only-v1",
      outcomeWeight: 1,
      testsWeight: 0,
      efficiencyWeight: 0,
      autonomyWeight: 0,
      safetyWeight: 0,
    });
    expect(report.evaluation.score).toBe(100);
    expect(report.policy.id).toBe("outcome-only-v1");
  });

  it("marks scores provisional and excludes missing test and safety dimensions", () => {
    const report = evaluateEvidence(createEvidenceBundle([workflowEvidence()]), run);
    expect(report.scoreStatus).toBe("provisional");
    expect(report.evidenceCoverage).toMatchObject({
      tests: false,
      safety: false,
      provisional: true,
      missing: ["Parsed test report", "Code diff"],
    });
    expect(report.evaluation.breakdown.tests).toBe(50);
    expect(report.evaluation.score).toBe(99);
    expect(report.evaluation.recommendations.join(" ")).toContain("provisional");
    expect(report.scoreExplanation).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "tests", score: null, available: false, appliedWeight: 0, contribution: 0 }),
      expect.objectContaining({ key: "safety", score: null, available: false, appliedWeight: 0, contribution: 0 }),
    ]));
    const explainedScore = report.scoreExplanation.reduce((sum, dimension) => sum + dimension.contribution, 0);
    expect(Math.round(explainedScore)).toBe(report.evaluation.score);
    expect(report.scoreExplanation.find((dimension) => dimension.key === "outcome")?.appliedWeight).toBeCloseTo(58.33);
  });

  it("verifies scores when both test and diff evidence are present", () => {
    const report = evaluateEvidence(createEvidenceBundle([
      workflowEvidence(),
      ingestTestEvidence({ framework: "vitest", total: 10, passed: 10, failed: 0, sourceId: "test-1" }),
      ingestGitDiffEvidence({ baseCommit: "base", headCommit: "head", filesChanged: 2, linesAdded: 12, linesDeleted: 1, sourceId: "diff-1" }),
    ]), { ...run, tests: { total: 10, passed: 10, failed: 0 } });
    expect(report.scoreStatus).toBe("verified");
    expect(report.evidenceCoverage).toMatchObject({ tests: true, safety: true, provisional: false, missing: [] });
    expect(report.scoreExplanation.every((dimension) => dimension.available)).toBe(true);
    expect(report.scoreExplanation.reduce((sum, dimension) => sum + dimension.appliedWeight, 0)).toBeCloseTo(100);
  });

  it("keeps a score provisional if only one evidence dimension is available", () => {
    const report = evaluateEvidence(createEvidenceBundle([
      workflowEvidence(),
      ingestTestEvidence({ framework: "vitest", total: 10, passed: 8, failed: 2, sourceId: "test-1" }),
    ]), { ...run, tests: { total: 10, passed: 8, failed: 2 } });
    expect(report.scoreStatus).toBe("provisional");
    expect(report.evidenceCoverage.tests).toBe(true);
    expect(report.evidenceCoverage.safety).toBe(false);
    expect(report.evidenceCoverage.missing).toEqual(["Code diff"]);
  });
});
