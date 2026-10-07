export type EvidenceSource = "github" | "github-actions" | "test-report" | "git-diff" | "pull-request" | "generic";
export type EvidenceKind = "repository" | "workflow-run" | "workflow-job" | "job" | "step" | "test-suite" | "test-case" | "diff" | "pull-request" | "commit" | "review" | "comment";
export interface EvidenceProvenance { source: EvidenceSource; sourceId: string; collectedAt: string; schemaVersion: string; }
export interface Evidence { id: string; kind: EvidenceKind; timestamp: string; provenance: EvidenceProvenance; data: Record<string, unknown>; }
export interface EvidenceBundle { schemaVersion: "1.0"; evidence: Evidence[]; }
export interface GitHubActionsEvidenceInput { runId: string | number; workflowName: string; status: "queued" | "in_progress" | "completed"; conclusion?: string | null; startedAt?: string | null; completedAt?: string | null; repository: string; commitSha: string; prNumber?: number | null; }
export interface TestEvidenceInput { framework: string; total: number; passed: number; failed: number; skipped?: number; durationMs?: number; sourceId: string; }
export interface GitDiffEvidenceInput { baseCommit: string; headCommit: string; filesChanged: number; linesAdded: number; linesDeleted: number; sourceId: string; }
export interface PullRequestEvidenceInput { number: number; repository: string; state: "open" | "closed"; merged: boolean; sourceId: string; createdAt: string; updatedAt?: string; mergedAt?: string | null; }
