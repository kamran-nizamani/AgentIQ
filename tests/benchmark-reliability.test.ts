import { describe, expect, it } from "vitest";
import { rankAgents, type BenchmarkRun } from "../src/benchmark.js";
import type { AgentEvaluation } from "../src/types.js";

function run(agentId: string, score: number): BenchmarkRun {
  const evaluation: AgentEvaluation = {
    runId: agentId + "-" + score,
    score,
    grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F",
    breakdown: { outcome: score, tests: score, efficiency: score, autonomy: score, safety: score },
    recommendations: [],
  };
  return { agentId, evaluation };
}

describe("benchmark reliability context", () => {
  it("marks one-run and small-sample rankings as provisional", () => {
    const entries = rankAgents([run("solo", 80), run("small", 70), run("small", 90)]);
    expect(entries.find((entry) => entry.agentId === "solo")).toMatchObject({
      runs: 1, sampleSize: "single-run", provisional: true,
      averageScore: 80, medianScore: 80, scoreStdDev: 0,
    });
    expect(entries.find((entry) => entry.agentId === "small")).toMatchObject({
      runs: 2, sampleSize: "small-sample", provisional: true,
      averageScore: 80, medianScore: 80, scoreStdDev: 10,
      minScore: 70, maxScore: 90,
    });
  });

  it("only labels five or more runs as multi-run", () => {
    const entries = rankAgents([70, 80, 90, 60, 100].map((score) => run("agent", score)));
    expect(entries[0]).toMatchObject({ runs: 5, sampleSize: "multi-run", provisional: false });
  });

  it("sorts ties deterministically by stability then agent id", () => {
    const entries = rankAgents([
      run("z-noisy", 60), run("z-noisy", 100),
      run("b-stable", 80), run("b-stable", 80),
      run("a-stable", 80), run("a-stable", 80),
    ]);
    expect(entries.map((entry) => entry.agentId)).toEqual(["a-stable", "b-stable", "z-noisy"]);
  });

  it("defines successRate as a score-threshold rate, not task outcome", () => {
    const entries = rankAgents([run("mixed", 59), run("mixed", 60), run("mixed", 100)]);
    expect(entries[0].successRate).toBe(67);
  });

  it("rejects blank agent identifiers and invalid scores", () => {
    expect(() => rankAgents([run("  ", 80)])).toThrow("non-empty agentId");
    expect(() => rankAgents([run("agent", 101)])).toThrow("between 0 and 100");
    expect(() => rankAgents([run("agent", Number.NaN)])).toThrow("between 0 and 100");
  });

  it("returns an empty list when no evaluations are supplied", () => {
    expect(rankAgents([])).toEqual([]);
  });
});
