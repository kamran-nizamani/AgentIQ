import type { Evidence } from "./evidence.js";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence-schema.js";
import type { GitHubWorkflowJobSnapshot, GitHubWorkflowRunSnapshot } from "./github-ci.js";

/** Milliseconds between two ISO timestamps, or null when either is missing or invalid or the span is negative. */
export function durationBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

export interface JobTelemetry {
  durationMs: number | null;
  stepCount: number;
  failedSteps: string[];
  skippedSteps: number;
}

export function summarizeJob(job: GitHubWorkflowJobSnapshot): JobTelemetry {
  const steps = job.steps ?? [];
  return {
    durationMs: durationBetween(job.startedAt, job.completedAt),
    stepCount: steps.length,
    failedSteps: steps.filter((step) => step.conclusion === "failure" || step.conclusion === "timed_out").map((step) => step.name),
    skippedSteps: steps.filter((step) => step.conclusion === "skipped").length,
  };
}

/**
 * One evidence item per step, so step status is queryable on its own. The job
 * does not report step timestamps through this collector, so no step duration
 * is invented.
 */
export function ingestWorkflowStepEvidence(repository: string, runId: number, job: GitHubWorkflowJobSnapshot): Evidence[] {
  const now = new Date().toISOString();
  return (job.steps ?? []).map((step, index) => {
    const number = step.number ?? index + 1;
    const sourceId = `${job.id}:${number}`;
    return {
      id: `github:step:${repository}:${sourceId}`,
      kind: "step",
      timestamp: job.completedAt ?? job.startedAt ?? now,
      provenance: { source: "github", sourceId, collectedAt: now, schemaVersion: EVIDENCE_SCHEMA_VERSION },
      data: {
        repository,
        runId,
        jobId: job.id,
        jobName: job.name,
        number,
        name: step.name,
        status: step.status,
        conclusion: step.conclusion ?? null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Agent-workflow identification
// ---------------------------------------------------------------------------

export interface AgentWorkflowOptions {
  /** Extra case-insensitive keywords to treat as agent markers, in addition to the built-ins. */
  extraKeywords?: string[];
  /** Extra branch prefixes agents push to, e.g. "my-bot/". */
  extraBranchPrefixes?: string[];
}

export interface AgentWorkflowMatch {
  isAgentWorkflow: boolean;
  /** Which fields matched, e.g. "branch:claude/". Explains the decision. */
  signals: string[];
}

const AGENT_KEYWORDS = ["copilot", "claude", "codex", "devin", "cursor", "aider", "openhands", "swe-agent", "sweagent", "agentiq", "ai-agent", "coding-agent", "autofix"];
const AGENT_BRANCH_PREFIXES = ["copilot/", "claude/", "codex/", "devin/", "cursor/", "aider/", "agent/", "ai/", "openhands/", "autofix/"];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Decide whether a workflow run looks agent-driven. This is a transparent
 * heuristic over the run's name, path, branch and actor; it returns the exact
 * signals so a human can see why, and it is never used to hide a run.
 */
export function identifyAgentWorkflow(run: GitHubWorkflowRunSnapshot, options: AgentWorkflowOptions = {}): AgentWorkflowMatch {
  const signals: string[] = [];
  const keywords = [...AGENT_KEYWORDS, ...(options.extraKeywords ?? []).map((value) => value.toLowerCase())];
  const prefixes = [...AGENT_BRANCH_PREFIXES, ...(options.extraBranchPrefixes ?? []).map((value) => value.toLowerCase())];

  const matchesKeyword = (text: string, keyword: string): boolean =>
    new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}([^a-z0-9]|$)`, "i").test(text);

  const fields: Array<[string, string | null | undefined]> = [
    ["name", run.name],
    ["path", run.workflowPath],
    ["actor", run.actor],
  ];
  for (const [field, value] of fields) {
    if (!value) continue;
    for (const keyword of keywords) {
      if (matchesKeyword(value, keyword)) signals.push(`${field}:${keyword}`);
    }
  }
  const branch = (run.branch ?? "").toLowerCase();
  for (const prefix of prefixes) {
    if (branch.startsWith(prefix)) signals.push(`branch:${prefix}`);
  }
  return { isAgentWorkflow: signals.length > 0, signals };
}

// ---------------------------------------------------------------------------
// CI history
// ---------------------------------------------------------------------------

export interface WorkflowHistory {
  workflow: string;
  runs: number;
  completed: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  medianDurationMs: number | null;
}

export interface CiHistorySummary {
  totalRuns: number;
  completedRuns: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  inProgress: number;
  /** succeeded / (succeeded + failed); null when nothing finished conclusively. Cancelled runs are excluded. */
  successRate: number | null;
  retriedRuns: number;
  /** Commits whose same workflow failed and then passed without a code change: a flakiness signal, not proof. */
  suspectedFlakyCommits: string[];
  averageDurationMs: number | null;
  longestDurationMs: number | null;
  byWorkflow: WorkflowHistory[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function summarizeCiHistory(runs: GitHubWorkflowRunSnapshot[]): CiHistorySummary {
  let succeeded = 0, failed = 0, cancelled = 0, inProgress = 0, retriedRuns = 0;
  const durations: number[] = [];
  const perWorkflow = new Map<string, { runs: number; completed: number; succeeded: number; failed: number; durations: number[] }>();
  const outcomesByCommitWorkflow = new Map<string, Array<{ attempt: number; runNumber: number; ok: boolean }>>();

  for (const run of runs) {
    const completed = run.status === "completed";
    const stat = perWorkflow.get(run.name) ?? { runs: 0, completed: 0, succeeded: 0, failed: 0, durations: [] };
    stat.runs += 1;
    if (!completed) {
      inProgress += 1;
    } else {
      stat.completed += 1;
      const duration = durationBetween(run.createdAt, run.updatedAt);
      if (duration !== null) { durations.push(duration); stat.durations.push(duration); }
      if (run.conclusion === "success") { succeeded += 1; stat.succeeded += 1; }
      else if (run.conclusion === "cancelled") { cancelled += 1; }
      else if (run.conclusion === "failure" || run.conclusion === "timed_out") { failed += 1; stat.failed += 1; }
      if (run.conclusion === "success" || run.conclusion === "failure" || run.conclusion === "timed_out") {
        const key = `${run.headSha}\u0000${run.name}`;
        const list = outcomesByCommitWorkflow.get(key) ?? [];
        list.push({ attempt: run.runAttempt ?? 1, runNumber: run.runNumber, ok: run.conclusion === "success" });
        outcomesByCommitWorkflow.set(key, list);
      }
    }
    if ((run.runAttempt ?? 1) > 1) retriedRuns += 1;
    perWorkflow.set(run.name, stat);
  }

  const suspectedFlakyCommits: string[] = [];
  for (const [key, outcomes] of outcomesByCommitWorkflow) {
    const ordered = [...outcomes].sort((a, b) => a.attempt - b.attempt || a.runNumber - b.runNumber);
    const firstFailure = ordered.findIndex((outcome) => !outcome.ok);
    if (firstFailure !== -1 && ordered.slice(firstFailure + 1).some((outcome) => outcome.ok)) {
      const sha = key.split("\u0000")[0]!;
      if (!suspectedFlakyCommits.includes(sha)) suspectedFlakyCommits.push(sha);
    }
  }

  const conclusive = succeeded + failed;
  return {
    totalRuns: runs.length,
    completedRuns: runs.length - inProgress,
    succeeded,
    failed,
    cancelled,
    inProgress,
    successRate: conclusive ? succeeded / conclusive : null,
    retriedRuns,
    suspectedFlakyCommits,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    longestDurationMs: durations.length ? Math.max(...durations) : null,
    byWorkflow: [...perWorkflow.entries()].map(([workflow, stat]) => {
      const done = stat.succeeded + stat.failed;
      return {
        workflow,
        runs: stat.runs,
        completed: stat.completed,
        succeeded: stat.succeeded,
        failed: stat.failed,
        successRate: done ? stat.succeeded / done : null,
        medianDurationMs: median(stat.durations),
      };
    }).sort((a, b) => b.runs - a.runs || a.workflow.localeCompare(b.workflow)),
  };
}
