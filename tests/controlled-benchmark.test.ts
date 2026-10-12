import { describe, expect, it } from "vitest";
import { compareControlledBenchmarks, type ControlledBenchmarkRun } from "../src/controlled-benchmark.js";
import type { AgentEvaluation, TaskOutcome } from "../src/types.js";

const controls = {
  taskId: "issue-42",
  repository: "owner/repo",
  baseCommitSha: "abcdef1234567",
  testSuiteVersion: "unit-v3",
  environmentFingerprint: "node22-linux-x64",
  policyVersion: "score-policy-v1",
};

function run(agentId: string, score: number, taskOutcome: TaskOutcome = "success", overrides: Partial<ControlledBenchmarkRun> = {}): ControlledBenchmarkRun {
  const evaluation: AgentEvaluation = {
    runId: agentId + "-" + score,
    score,
    grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F",
    breakdown: { outcome: score, tests: score, efficiency: score, autonomy: score, safety: score },
    recommendations: [],
  };
  return {
    runId: agentId + "-" + score,
    agentId,
    modelId: "model-1",
    configId: "default",
    ...controls,
    taskOutcome,
    evaluation,
    durationMs: 1000,
    costUsd: 0.02,
    testPassRate: 100,
    ...overrides,
  };
}

describe("controlled benchmark cohorts", () => {
  it("compares only runs with identical controls and computes observed outcomes", () => {
    const result = compareControlledBenchmarks([
      run("agent-a", 80, "success"),
      run("agent-a", 70, "failure"),
      run("agent-b", 90, "success", { durationMs: 2000, costUsd: 0.04, testPassRate: 90 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].comparable).toBe(true);
    expect(result[0].provisional).toBe(true);
    expect(result[0].controls).toMatchObject({ taskId: "issue-42", repository: "owner/repo", baseCommitSha: "abcdef1234567" });
    expect(result[0].agents.find((agent) => agent.agentId === "agent-a")).toMatchObject({
      runs: 2, averageScore: 75, taskSuccessRate: 50, averageDurationMs: 1000, averageCostUsd: 0.02,
    });
    expect(result[0].agents.find((agent) => agent.agentId === "agent-b")).toMatchObject({
      runs: 1, taskSuccessRate: 100, averageDurationMs: 2000, averageCostUsd: 0.04, averageTestPassRate: 90,
    });
    expect(result[0].warnings.some((warning) => warning.includes("provisional"))).toBe(true);
  });

  it("splits runs with different base commits into separate cohorts", () => {
    const result = compareControlledBenchmarks([
      run("agent-a", 80),
      run("agent-b", 90, "success", { baseCommitSha: "123456789abcd" }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((cohort) => !cohort.comparable)).toBe(true);
  });

  it("does not claim comparability with only one agent configuration", () => {
    const result = compareControlledBenchmarks([run("agent-a", 80), run("agent-a", 90)]);
    expect(result[0].comparable).toBe(false);
    expect(result[0].warnings[0]).toContain("fewer than two agent configurations");
  });

  it("requires the control metadata and a valid commit SHA", () => {
    expect(() => compareControlledBenchmarks([run("agent-a", 80, "success", { environmentFingerprint: " " })]))
      .toThrow("environmentFingerprint is required");
    expect(() => compareControlledBenchmarks([run("agent-a", 80, "success", { baseCommitSha: "not-a-sha" })]))
      .toThrow("valid 7-40 character hexadecimal commit SHA");
  });

  it("validates optional metrics rather than accepting impossible values", () => {
    expect(() => compareControlledBenchmarks([run("agent-a", 80, "success", { costUsd: -1 })]))
      .toThrow("costUsd values must be finite");
    expect(() => compareControlledBenchmarks([run("agent-a", 80, "success", { testPassRate: 101 })]))
      .toThrow("testPassRate values must be finite");
  });

  it("returns an empty list for an empty benchmark", () => {
    expect(compareControlledBenchmarks([])).toEqual([]);
  });
});
