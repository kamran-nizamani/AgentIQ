import type { AgentEvaluation, TaskOutcome } from "./types.js";

export interface ControlledBenchmarkRun {
  runId: string;
  agentId: string;
  modelId: string;
  configId: string;
  taskId: string;
  repository: string;
  baseCommitSha: string;
  testSuiteVersion: string;
  environmentFingerprint: string;
  policyVersion: string;
  taskOutcome: TaskOutcome;
  evaluation: AgentEvaluation;
  durationMs?: number | null;
  costUsd?: number | null;
  testPassRate?: number | null;
}

export interface BenchmarkControls {
  taskId: string;
  repository: string;
  baseCommitSha: string;
  testSuiteVersion: string;
  environmentFingerprint: string;
  policyVersion: string;
}

export interface ControlledAgentSummary {
  agentId: string;
  modelId: string;
  configId: string;
  runs: number;
  averageScore: number;
  medianScore: number;
  scoreStdDev: number;
  taskSuccessRate: number;
  averageDurationMs: number | null;
  averageCostUsd: number | null;
  averageTestPassRate: number | null;
  provisional: boolean;
}

export interface ControlledBenchmarkComparison {
  controls: BenchmarkControls;
  comparable: boolean;
  provisional: boolean;
  agents: ControlledAgentSummary[];
  warnings: string[];
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + " is required for controlled benchmarking.");
  return normalized;
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

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function optionalMetric(values: Array<number | null | undefined>, field: string, max?: number): number | null {
  const present = values.filter((value): value is number => value !== null && value !== undefined);
  if (present.some((value) => !Number.isFinite(value) || value < 0 || (max !== undefined && value > max))) {
    throw new Error(field + " values must be finite and within the supported range.");
  }
  const result = average(present);
  return result === null ? null : round1(result);
}

function controlsFor(run: ControlledBenchmarkRun): BenchmarkControls {
  const baseCommitSha = requireText(run.baseCommitSha, "baseCommitSha").toLowerCase();
  if (!/^[a-f0-9]{7,40}$/.test(baseCommitSha)) {
    throw new Error("baseCommitSha must be a valid 7-40 character hexadecimal commit SHA.");
  }
  return {
    taskId: requireText(run.taskId, "taskId"),
    repository: requireText(run.repository, "repository").toLowerCase(),
    baseCommitSha,
    testSuiteVersion: requireText(run.testSuiteVersion, "testSuiteVersion"),
    environmentFingerprint: requireText(run.environmentFingerprint, "environmentFingerprint"),
    policyVersion: requireText(run.policyVersion, "policyVersion"),
  };
}

/**
 * Compare agent configurations only inside identical task/repository/base/test/environment/policy cohorts.
 * These are descriptive comparisons, not significance tests or proof of causal superiority.
 */
export function compareControlledBenchmarks(runs: ControlledBenchmarkRun[]): ControlledBenchmarkComparison[] {
  const cohorts = new Map<string, { controls: BenchmarkControls; runs: ControlledBenchmarkRun[] }>();
  const seenRunIds = new Set<string>();

  for (const run of runs) {
    const runId = requireText(run.runId, "runId");
    if (seenRunIds.has(runId)) throw new Error("Duplicate runId is not allowed in a controlled benchmark.");
    seenRunIds.add(runId);
    requireText(run.agentId, "agentId");
    requireText(run.modelId, "modelId");
    requireText(run.configId, "configId");
    if (!Number.isFinite(run.evaluation.score) || run.evaluation.score < 0 || run.evaluation.score > 100) {
      throw new Error("Benchmark scores must be finite numbers between 0 and 100.");
    }
    if (!["success", "partial", "failure"].includes(run.taskOutcome)) {
      throw new Error("taskOutcome must be success, partial, or failure.");
    }
    const controls = controlsFor(run);
    const key = JSON.stringify(controls);
    const cohort = cohorts.get(key) ?? { controls, runs: [] };
    cohort.runs.push(run);
    cohorts.set(key, cohort);
  }

  return [...cohorts.values()].map(({ controls, runs: cohortRuns }) => {
    const grouped = new Map<string, ControlledBenchmarkRun[]>();
    for (const run of cohortRuns) {
      const key = JSON.stringify([run.agentId.trim(), run.modelId.trim(), run.configId.trim()]);
      const group = grouped.get(key) ?? [];
      group.push(run);
      grouped.set(key, group);
    }

    const agents: ControlledAgentSummary[] = [...grouped.values()].map((agentRuns) => {
      const scores = agentRuns.map((run) => run.evaluation.score);
      const sorted = [...scores].sort((a, b) => a - b);
      const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
      return {
        agentId: agentRuns[0].agentId.trim(),
        modelId: agentRuns[0].modelId.trim(),
        configId: agentRuns[0].configId.trim(),
        runs: agentRuns.length,
        averageScore: round1(mean),
        medianScore: round1(median(sorted)),
        scoreStdDev: round1(Math.sqrt(variance)),
        taskSuccessRate: round1(agentRuns.filter((run) => run.taskOutcome === "success").length / agentRuns.length * 100),
        averageDurationMs: optionalMetric(agentRuns.map((run) => run.durationMs), "durationMs"),
        averageCostUsd: optionalMetric(agentRuns.map((run) => run.costUsd), "costUsd"),
        averageTestPassRate: optionalMetric(agentRuns.map((run) => run.testPassRate), "testPassRate", 100),
        provisional: agentRuns.length < 5,
      };
    }).sort((a, b) => b.averageScore - a.averageScore || a.agentId.localeCompare(b.agentId) || a.modelId.localeCompare(b.modelId) || a.configId.localeCompare(b.configId));

    const warnings: string[] = [];
    if (agents.length < 2) warnings.push("This control cohort has fewer than two agent configurations; no head-to-head comparison is available.");
    if (agents.some((agent) => agent.provisional)) warnings.push("At least one configuration has fewer than five trials; results are provisional.");
    warnings.push("Scores are descriptive. No statistical significance or causal superiority is inferred.");
    return {
      controls,
      comparable: agents.length >= 2,
      provisional: agents.some((agent) => agent.provisional),
      agents,
      warnings,
    };
  }).sort((a, b) =>
    a.controls.taskId.localeCompare(b.controls.taskId) ||
    a.controls.repository.localeCompare(b.controls.repository) ||
    a.controls.baseCommitSha.localeCompare(b.controls.baseCommitSha)
  );
}
