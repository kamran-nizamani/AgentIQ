import { createEvidenceBundle, ingestGitDiffEvidence, ingestTestEvidence } from "../src/ingestion.js";
import { parseTestLogSummary } from "../src/test-log.js";
import { evaluateEvidence } from "../src/evaluation.js";
import { ingestWorkflowJobSnapshot, ingestWorkflowRunSnapshot, type GitHubWorkflowJobSnapshot, type GitHubWorkflowRunSnapshot } from "../src/github-ci.js";
import { evidenceBundleToAgentRun } from "../src/normalize.js";
import type { EvidenceBundle } from "../src/evidence.js";

export type GitHubRunApi = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  run_number: number;
  event: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string | null;
  run_attempt?: number;
  path?: string;
  html_url: string;
};

type GitHubJobApi = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  runner_name?: string | null;
  steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }>;
  html_url?: string;
};

type GitHubRunsResponse = { total_count: number; workflow_runs: GitHubRunApi[] };
type GitHubJobsResponse = { total_count: number; jobs: GitHubJobApi[] };
type GitHubCommitApi = {
  sha: string;
  parents?: Array<{ sha: string }>;
  stats?: { total?: number; additions?: number; deletions?: number };
  files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
};

export type LiveRunRecord = {
  runId: string;
  repository: string;
  score: number;
  grade: string;
  outcome: "success" | "partial" | "failure";
  storedAt: string;
  evidenceCount: number;
  riskCount: number;
  agent: string;
  task: string;
  durationMs: number;
  url: string;
  branch: string;
  commitSha: string;
  workflow: string;
  event: string;
  status: string;
  conclusion: string | null;
  runNumber: number;
  tests: { total: number; passed: number; failed: number };
  changes: { filesChanged: number; linesAdded: number; linesDeleted: number };
  breakdown: { outcome: number; tests: number; efficiency: number; autonomy: number; safety: number };
  recommendations: string[];
  evidenceKinds: string[];
  testEvidenceAvailable: boolean;
  diffEvidenceAvailable: boolean;
  riskAssessment: "not-assessed" | "assessed";
};

export class GitHubLiveError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
    this.name = "GitHubLiveError";
  }
}

export function configuredRepository(): string {
  const repository = process.env.AGENTIQ_GITHUB_REPOSITORY || "kamran-nizamani/AgentIQ";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new GitHubLiveError("AGENTIQ_GITHUB_REPOSITORY must use the owner/repository format.", 500);
  }
  return repository;
}

async function githubGet<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AgentIQ",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch("https://api.github.com" + path, { headers, cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) {
      throw new GitHubLiveError("GitHub could not find the repository or Actions run. Confirm the repository is public or configure GITHUB_TOKEN for private repositories.", 502);
    }
    if (response.status === 403 || response.status === 429) {
      throw new GitHubLiveError("GitHub API rate limit or permission error. Configure a least-privilege GITHUB_TOKEN in Vercel project environment variables.", 502);
    }
    throw new GitHubLiveError("GitHub Actions API returned HTTP " + response.status + ".", 502);
  }
  return await response.json() as T;
}

async function githubGetText(path: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AgentIQ",
  };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch("https://api.github.com" + path, { headers, cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new GitHubLiveError("GitHub job logs are unavailable (HTTP " + response.status + ").", 502);
  // Test summaries are conventionally near the end; cap retained text to keep function memory bounded.
  return (await response.text()).slice(-2_000_000);
}

async function collectTestEvidence(repository: string, jobs: GitHubJobApi[], evidence: EvidenceBundle): Promise<void> {
  const candidates = jobs.filter((job) => job.status === "completed" && /test|ci/i.test(job.name)).slice(0, 8);
  const summaries = await Promise.all(candidates.map(async (job) => {
    try {
      const log = await githubGetText("/repos/" + repository + "/actions/jobs/" + job.id + "/logs");
      const summary = parseTestLogSummary(log);
      if (!summary || summary.total <= 0) return null;
      return ingestTestEvidence({
        framework: summary.framework,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        durationMs: summary.durationMs,
        sourceId: "github-job-log:" + job.id,
      });
    } catch {
      // A missing or inaccessible log is not test evidence.
      return null;
    }
  }));
  for (const summary of summaries) if (summary) evidence.evidence.push(summary);
}

function toWorkflowSnapshot(raw: GitHubRunApi): GitHubWorkflowRunSnapshot {
  return {
    id: raw.id,
    name: raw.name || "GitHub Actions workflow",
    status: raw.status,
    conclusion: raw.conclusion,
    headSha: raw.head_sha,
    runNumber: raw.run_number,
    event: raw.event,
    branch: raw.head_branch,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    runAttempt: raw.run_attempt,
    workflowPath: raw.path,
    htmlUrl: raw.html_url,
  };
}

function toJobSnapshot(raw: GitHubJobApi): GitHubWorkflowJobSnapshot {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    conclusion: raw.conclusion,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    runnerName: raw.runner_name,
    htmlUrl: raw.html_url,
    steps: (raw.steps || []).map((step) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      number: step.number,
    })),
  };
}

function normalizeOutcome(conclusion: string | null): "success" | "partial" | "failure" {
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled" || conclusion === "startup_failure") return "failure";
  return "partial";
}

export function normalizeWorkflowRun(repository: string, raw: GitHubRunApi, jobs: GitHubJobApi[] = []): LiveRunRecord & { evidence: EvidenceBundle; evaluation: ReturnType<typeof evaluateEvidence> } {
  const workflow = ingestWorkflowRunSnapshot(repository, toWorkflowSnapshot(raw));
  workflow.data.startedAt = raw.run_started_at || raw.created_at;
  workflow.data.completedAt = raw.status === "completed" ? raw.updated_at : null;
  const jobEvidence = jobs.map((job) => ingestWorkflowJobSnapshot(repository, raw.id, toJobSnapshot(job)));
  const evidence = createEvidenceBundle([workflow, ...jobEvidence]);
  const run = evidenceBundleToAgentRun(evidence);
  run.id = String(raw.id);
  run.taskOutcome = normalizeOutcome(raw.conclusion);
  if (raw.status !== "completed") {
    run.execution.durationMs = Math.max(0, Date.now() - Date.parse(raw.run_started_at || raw.created_at));
  }
  const evaluation = evaluateEvidence(evidence, run);
  const testEvidenceAvailable = evidence.evidence.some((item) => item.kind === "test-suite");
  const diffEvidenceAvailable = evidence.evidence.some((item) => item.kind === "diff");
  const record: LiveRunRecord = {
    runId: String(raw.id),
    repository,
    score: evaluation.evaluation.score,
    grade: evaluation.evaluation.grade,
    outcome: run.taskOutcome,
    storedAt: raw.updated_at || raw.created_at,
    evidenceCount: evidence.evidence.length,
    riskCount: evaluation.riskSignals.length,
    agent: "GitHub Actions",
    task: raw.name || "GitHub Actions workflow",
    durationMs: run.execution.durationMs,
    url: raw.html_url,
    branch: raw.head_branch || "",
    commitSha: raw.head_sha,
    workflow: raw.name || "GitHub Actions workflow",
    event: raw.event || "unknown",
    status: raw.status,
    conclusion: raw.conclusion,
    runNumber: raw.run_number,
    tests: run.tests,
    changes: run.changes,
    breakdown: evaluation.evaluation.breakdown,
    recommendations: evaluation.evaluation.recommendations,
    evidenceKinds: evidence.evidence.map((item) => item.kind),
    testEvidenceAvailable,
    diffEvidenceAvailable,
    riskAssessment: diffEvidenceAvailable ? "assessed" : "not-assessed",
  };
  return { ...record, evidence, evaluation };
}

export async function listLiveRuns(options: { limit: number; offset: number }): Promise<{ data: LiveRunRecord[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean }; meta: { source: string; repository: string; authenticated: boolean; generatedAt: string; note: string } }> {
  const repository = configuredRepository();
  const page = Math.floor(options.offset / 100) + 1;
  const withinPageOffset = options.offset % 100;
  const payload = await githubGet<GitHubRunsResponse>("/repos/" + repository + "/actions/runs?per_page=100&page=" + page);
  const selected = payload.workflow_runs.slice(withinPageOffset, withinPageOffset + options.limit);
  const data = selected.map((raw) => {
    const normalized = normalizeWorkflowRun(repository, raw);
    const { evidence: _evidence, evaluation: _evaluation, ...summary } = normalized;
    return summary;
  });
  return {
    data,
    pagination: { total: payload.total_count, limit: options.limit, offset: options.offset, hasMore: options.offset + data.length < payload.total_count },
    meta: {
      source: "github-actions-live",
      repository,
      authenticated: Boolean(process.env.GITHUB_TOKEN),
      generatedAt: new Date().toISOString(),
      note: "Workflow metadata is live; opening a run fetches its jobs and steps. Test counts and code-diff risk remain unassessed until dedicated test-report and diff evidence is connected.",
    },
  };
}

function classifySensitivePath(path: string): "critical" | "high" | null {
  const normalized = path.replaceAll("\\\\", "/").toLowerCase();
  const parts = normalized.split("/");
  const basename = parts[parts.length - 1] || normalized;
  if ((basename.startsWith(".env") && !basename.endsWith(".example") && !basename.endsWith(".sample")) ||
      basename === "id_rsa" || basename === "id_ed25519" ||
      basename.includes("private-key") || basename.includes("private_key") ||
      ((basename.includes("secret") || basename.includes("credential")) &&
       [".json", ".yaml", ".yml", ".toml"].some((ext) => basename.endsWith(ext)))) return "critical";
  if (normalized.includes(".github/workflows/") ||
      ["auth", "authorization", "security", "crypto", "cryptography", "deploy", "terraform", "k8s", "kubernetes"].some((segment) => parts.includes(segment)) ||
      ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt", "pyproject.toml", "poetry.lock", "cargo.toml", "go.mod", "go.sum"].includes(basename)) return "high";
  return null;
}

async function collectCommitEvidence(repository: string, raw: GitHubRunApi, evidence: EvidenceBundle): Promise<void> {
  if (!raw.head_sha || !/^[a-f0-9]{7,40}$/i.test(raw.head_sha)) return;
  try {
    const commit = await githubGet<GitHubCommitApi>("/repos/" + repository + "/commits/" + raw.head_sha);
    const files = Array.isArray(commit.files) ? commit.files : [];
    const sensitiveFiles = files
      .map((file) => ({ path: file.filename, severity: classifySensitivePath(file.filename) }))
      .filter((file): file is { path: string; severity: "critical" | "high" } => file.severity !== null);
    const dependencyFiles = files.filter((file) => ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt", "pyproject.toml", "poetry.lock", "cargo.toml", "go.mod", "go.sum"].includes(file.filename.toLowerCase().split("/").pop() || "")).map((file) => file.filename);
    const diffEvidence = ingestGitDiffEvidence({
      baseCommit: commit.parents?.[0]?.sha || raw.head_sha,
      headCommit: raw.head_sha,
      filesChanged: files.length,
      linesAdded: commit.stats?.additions ?? files.reduce((sum, file) => sum + (file.additions || 0), 0),
      linesDeleted: commit.stats?.deletions ?? files.reduce((sum, file) => sum + (file.deletions || 0), 0),
      sourceId: "github-commit:" + raw.head_sha,
    });
    diffEvidence.data.changedFiles = files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
    }));
    diffEvidence.data.sensitiveFiles = sensitiveFiles;
    diffEvidence.data.dependencyFiles = dependencyFiles;
    diffEvidence.data.fileListTruncated = files.length >= 300;
    evidence.evidence.push(diffEvidence);
  } catch {
    // Keep run details usable when commit-level permissions or GitHub API limits prevent diff retrieval.
    // Missing diff evidence remains explicitly unassessed.
  }
}

export async function getLiveRun(runId: string): Promise<LiveRunRecord & { evidence: EvidenceBundle; evaluation: ReturnType<typeof evaluateEvidence>; jobs: GitHubJobApi[] }> {
  if (!/^\d+$/.test(runId)) throw new GitHubLiveError("Run ID must be a numeric GitHub Actions run ID.", 400);
  const repository = configuredRepository();
  const raw = await githubGet<GitHubRunApi>("/repos/" + repository + "/actions/runs/" + runId);
  const jobsPayload = await githubGet<GitHubJobsResponse>("/repos/" + repository + "/actions/runs/" + runId + "/jobs?per_page=100");
  const normalized = normalizeWorkflowRun(repository, raw, jobsPayload.jobs);
  await collectTestEvidence(repository, jobsPayload.jobs, normalized.evidence);
  await collectCommitEvidence(repository, raw, normalized.evidence);
  const refreshedRun = evidenceBundleToAgentRun(normalized.evidence);
  refreshedRun.id = String(raw.id);
  refreshedRun.taskOutcome = normalizeOutcome(raw.conclusion);
  if (raw.status !== "completed") {
    refreshedRun.execution.durationMs = Math.max(0, Date.now() - Date.parse(raw.run_started_at || raw.created_at));
  }
  const refreshedEvaluation = evaluateEvidence(normalized.evidence, refreshedRun);
  normalized.score = refreshedEvaluation.evaluation.score;
  normalized.grade = refreshedEvaluation.evaluation.grade;
  normalized.evidenceCount = normalized.evidence.evidence.length;
  normalized.riskCount = refreshedEvaluation.riskSignals.length;
  normalized.durationMs = refreshedRun.execution.durationMs;
  normalized.changes = refreshedRun.changes;
  normalized.breakdown = refreshedEvaluation.evaluation.breakdown;
  normalized.recommendations = refreshedEvaluation.evaluation.recommendations;
  normalized.evidenceKinds = normalized.evidence.evidence.map((item) => item.kind);
  normalized.testEvidenceAvailable = normalized.evidence.evidence.some((item) => item.kind === "test-suite");
  normalized.diffEvidenceAvailable = normalized.evidence.evidence.some((item) => item.kind === "diff");
  normalized.riskAssessment = normalized.diffEvidenceAvailable ? "assessed" : "not-assessed";
  normalized.evaluation = refreshedEvaluation;
  return { ...normalized, jobs: jobsPayload.jobs };
}
