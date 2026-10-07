import { describe, expect, it } from "vitest";
import { evaluateAgentRun } from "../src/index.js";

const successfulRun = {
  id: "run-001",
  taskOutcome: "success" as const,
  tests: { total: 10, passed: 10, failed: 0 },
  changes: { filesChanged: 3, linesAdded: 120, linesDeleted: 20 },
  execution: { durationMs: 60_000, estimatedCostUsd: 0.2 },
  humanIntervention: { required: false, interventions: 0 },
  rollback: false,
};

describe("evaluateAgentRun", () => {
  it("produces a deterministic high score for a successful run", () => {
    const first = evaluateAgentRun(successfulRun);
    const second = evaluateAgentRun(successfulRun);

    expect(first).toEqual(second);
    expect(first.runId).toBe("run-001");
    expect(first.score).toBeGreaterThanOrEqual(90);
    expect(first.grade).toBe("A");
  });

  it("penalizes failed tests and manual intervention", () => {
    const result = evaluateAgentRun({
      ...successfulRun,
      taskOutcome: "partial",
      tests: { total: 10, passed: 6, failed: 4 },
      humanIntervention: { required: true, interventions: 2 },
    });

    expect(result.breakdown.tests).toBe(60);
    expect(result.breakdown.autonomy).toBe(50);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("handles runs without test cases", () => {
    const result = evaluateAgentRun({
      ...successfulRun,
      tests: { total: 0, passed: 0, failed: 0 },
    });

    expect(result.breakdown.tests).toBe(50);
  });
});
