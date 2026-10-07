import type { AgentEvaluation, AgentRun, ScoreBreakdown } from "./types.js";

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

function outcomeScore(run: AgentRun): number {
  return {
    success: 100,
    partial: 60,
    failure: 0,
  }[run.taskOutcome];
}

function testScore(run: AgentRun): number {
  if (run.tests.total === 0) return 50;
  return clamp((run.tests.passed / run.tests.total) * 100);
}

function efficiencyScore(run: AgentRun): number {
  const durationPenalty = clamp(run.execution.durationMs / 600_000 * 40);
  const costPenalty = run.execution.estimatedCostUsd === undefined
    ? 0
    : clamp(run.execution.estimatedCostUsd / 1 * 30);
  return clamp(100 - durationPenalty - costPenalty);
}

function autonomyScore(run: AgentRun): number {
  if (!run.humanIntervention.required) return 100;
  return clamp(100 - run.humanIntervention.interventions * 25);
}

function safetyScore(run: AgentRun): number {
  return run.rollback ? 25 : 100;
}

export function evaluateAgentRun(run: AgentRun): AgentEvaluation {
  const breakdown: ScoreBreakdown = {
    outcome: outcomeScore(run),
    tests: testScore(run),
    efficiency: efficiencyScore(run),
    autonomy: autonomyScore(run),
    safety: safetyScore(run),
  };

  const score = Math.round(
    breakdown.outcome * 0.35 +
    breakdown.tests * 0.30 +
    breakdown.efficiency * 0.15 +
    breakdown.autonomy * 0.10 +
    breakdown.safety * 0.10,
  );

  const grade =
    score >= 90 ? "A" :
    score >= 80 ? "B" :
    score >= 70 ? "C" :
    score >= 60 ? "D" : "F";

  const recommendations: string[] = [];

  if (breakdown.tests < 80) recommendations.push("Improve test pass rate before considering the run successful.");
  if (breakdown.autonomy < 80) recommendations.push("Reduce manual interventions by improving agent context or task decomposition.");
  if (breakdown.efficiency < 70) recommendations.push("Investigate execution time and token/cost efficiency.");
  if (breakdown.safety < 100) recommendations.push("Investigate the rollback and add a guardrail to prevent recurrence.");

  return {
    runId: run.id,
    score,
    grade,
    breakdown,
    recommendations,
  };
}
