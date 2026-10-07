export type TaskOutcome = "success" | "partial" | "failure";

export interface AgentRun {
  id: string;
  taskOutcome: TaskOutcome;
  tests: {
    total: number;
    passed: number;
    failed: number;
  };
  changes: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  };
  execution: {
    durationMs: number;
    estimatedCostUsd?: number;
  };
  humanIntervention: {
    required: boolean;
    interventions: number;
  };
  rollback?: boolean;
}

export interface ScoreBreakdown {
  outcome: number;
  tests: number;
  efficiency: number;
  autonomy: number;
  safety: number;
}

export interface AgentEvaluation {
  runId: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: ScoreBreakdown;
  recommendations: string[];
}
