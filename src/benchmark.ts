import type { AgentEvaluation } from "./types.js";

export interface BenchmarkRun { agentId: string; evaluation: AgentEvaluation; }
export type BenchmarkSampleSize = "single-run" | "small-sample" | "multi-run";

export interface BenchmarkEntry {
  agentId: string;
  runs: number;
  averageScore: number;
  medianScore: number;
  scoreStdDev: number;
  minScore: number;
  maxScore: number;
  /** Percentage of runs scoring at least 60/100; this is a score threshold, not an observed task-success rate. */
  successRate: number;
  rank: number;
  sampleSize: BenchmarkSampleSize;
  provisional: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Summarize observed evaluations per agent.
 * Ranks are descriptive, not a controlled causal benchmark; small samples are explicitly marked.
 */
export function rankAgents(runs: BenchmarkRun[]): BenchmarkEntry[] {
  const grouped = new Map<string, number[]>();
  for (const run of runs) {
    const agentId = run.agentId.trim();
    const score = run.evaluation.score;
    if (!agentId) throw new Error("Benchmark run requires a non-empty agentId.");
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error("Benchmark scores must be finite numbers between 0 and 100.");
    }
    const list = grouped.get(agentId) ?? [];
    list.push(score);
    grouped.set(agentId, list);
  }

  const entries: BenchmarkEntry[] = [...grouped].map(([agentId, scores]) => {
    const sorted = [...scores].sort((a, b) => a - b);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
    const sampleSize: BenchmarkSampleSize = scores.length === 1
      ? "single-run"
      : scores.length < 5 ? "small-sample" : "multi-run";
    return {
      agentId,
      runs: scores.length,
      averageScore: Math.round(average),
      medianScore: round1(median(sorted)),
      scoreStdDev: round1(Math.sqrt(variance)),
      minScore: round1(sorted[0]),
      maxScore: round1(sorted[sorted.length - 1]),
      successRate: Math.round(scores.filter((score) => score >= 60).length / scores.length * 100),
      rank: 0,
      sampleSize,
      provisional: scores.length < 5,
    };
  });

  entries.sort((a, b) =>
    b.averageScore - a.averageScore ||
    b.successRate - a.successRate ||
    a.scoreStdDev - b.scoreStdDev ||
    a.agentId.localeCompare(b.agentId)
  );
  entries.forEach((entry, index) => { entry.rank = index + 1; });
  return entries;
}
