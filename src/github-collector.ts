import type { Evidence, EvidenceBundle } from "./evidence.js";
import { createEvidenceBundle } from "./ingestion.js";
import { ingestCommitSnapshot, ingestPullRequestSnapshot, ingestRepositorySnapshot, type GitHubCommitSnapshot, type GitHubIssueEventSnapshot, type GitHubPullRequestFileSnapshot, type GitHubPullRequestSnapshot, type GitHubRepositorySnapshot } from "./github-intelligence.js";
import { ingestCommentSnapshot, ingestReviewSnapshot, ingestWorkflowJobSnapshot, ingestWorkflowRunSnapshot, type GitHubCommentSnapshot, type GitHubReviewSnapshot, type GitHubWorkflowJobSnapshot, type GitHubWorkflowRunSnapshot } from "./github-ci.js";
import { identifyAgentWorkflow, ingestWorkflowStepEvidence, summarizeCiHistory, type CiHistorySummary } from "./ci-intelligence.js";
import { analyzeChangedFiles, changeAnalysisToDiffEvidence } from "./change-analysis.js";
import { buildPullRequestLifecycle, type PullRequestLifecycle } from "./pr-lifecycle.js";

export interface GitHubCollector {
  repository(): Promise<GitHubRepositorySnapshot>;
  commits(limit?: number): Promise<GitHubCommitSnapshot[]>;
  pullRequests(limit?: number): Promise<GitHubPullRequestSnapshot[]>;
  /** The methods below are optional so a minimal collector keeps working; collectGitHubIntelligence uses what exists. */
  workflowRuns?(limit?: number): Promise<GitHubWorkflowRunSnapshot[]>;
  workflowJobs?(runId: number, limit?: number): Promise<GitHubWorkflowJobSnapshot[]>;
  reviews?(pullRequestNumber: number, limit?: number): Promise<GitHubReviewSnapshot[]>;
  comments?(pullRequestNumber: number, limit?: number): Promise<GitHubCommentSnapshot[]>;
  pullRequestFiles?(pullRequestNumber: number, limit?: number): Promise<GitHubPullRequestFileSnapshot[]>;
  pullRequestEvents?(pullRequestNumber: number, limit?: number): Promise<GitHubIssueEventSnapshot[]>;
}

export interface GitHubCollectorOptions { maxCommits?: number; maxPullRequests?: number; }

export async function collectGitHubEvidence(collector: GitHubCollector, options: GitHubCollectorOptions = {}): Promise<EvidenceBundle> {
  const [repository, commits, pullRequests] = await Promise.all([
    collector.repository(),
    collector.commits(options.maxCommits ?? 50),
    collector.pullRequests(options.maxPullRequests ?? 50),
  ]);
  const evidence: Evidence[] = [
    ingestRepositorySnapshot(repository),
    ...commits.map(commit => ingestCommitSnapshot(repository.fullName, commit)),
    ...pullRequests.map(pr => ingestPullRequestSnapshot(repository.fullName, pr)),
  ];
  return createEvidenceBundle(evidence);
}

// ---------------------------------------------------------------------------
// Deep collection: CI history, reviews/comments, changed files, lifecycle
// ---------------------------------------------------------------------------

export interface GitHubIntelligenceOptions extends GitHubCollectorOptions {
  /** Workflow runs to fetch for CI history. Default 50. */
  maxWorkflowRuns?: number;
  /** Fetch jobs and steps for this many of the most recent runs. Default 10; 0 skips jobs. */
  maxRunsWithJobs?: number;
  /** Fetch reviews, comments, files and events for this many of the most recent PRs. Default 10; 0 skips. */
  maxPullRequestsDetailed?: number;
  /** Cap on changed files read per PR. Default 300. */
  maxFilesPerPullRequest?: number;
  agentKeywords?: string[];
  agentBranchPrefixes?: string[];
}

export interface GitHubIntelligence {
  bundle: EvidenceBundle;
  ci: CiHistorySummary;
  /** Runs that look agent-driven, with the signals that say why. */
  agentRuns: Array<{ runId: number; name: string; signals: string[] }>;
  pullRequests: PullRequestLifecycle[];
  /** What could not be collected. A permission error or rate limit lands here instead of failing everything. */
  warnings: string[];
}

async function settle<T>(label: string, warnings: string[], work: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (!work) return fallback;
  try {
    return await work();
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

export async function collectGitHubIntelligence(collector: GitHubCollector, options: GitHubIntelligenceOptions = {}): Promise<GitHubIntelligence> {
  const warnings: string[] = [];
  const [repository, commits, pullRequests] = await Promise.all([
    collector.repository(),
    collector.commits(options.maxCommits ?? 50),
    collector.pullRequests(options.maxPullRequests ?? 50),
  ]);
  const repo = repository.fullName;
  const evidence: Evidence[] = [
    ingestRepositorySnapshot(repository),
    ...commits.map((commit) => ingestCommitSnapshot(repo, commit)),
    ...pullRequests.map((pr) => ingestPullRequestSnapshot(repo, pr)),
  ];

  // CI history
  const runs = await settle("workflow runs", warnings,
    collector.workflowRuns ? () => collector.workflowRuns!(options.maxWorkflowRuns ?? 50) : undefined, [] as GitHubWorkflowRunSnapshot[]);
  const agentRuns: GitHubIntelligence["agentRuns"] = [];
  for (const run of runs) {
    const evidenceItem = ingestWorkflowRunSnapshot(repo, run);
    const match = identifyAgentWorkflow(run, { extraKeywords: options.agentKeywords, extraBranchPrefixes: options.agentBranchPrefixes });
    evidenceItem.data.agentWorkflow = match.isAgentWorkflow;
    evidenceItem.data.agentSignals = match.signals;
    evidence.push(evidenceItem);
    if (match.isAgentWorkflow) agentRuns.push({ runId: run.id, name: run.name, signals: match.signals });
  }
  const jobRuns = runs.slice(0, options.maxRunsWithJobs ?? 10);
  if (collector.workflowJobs) {
    for (const run of jobRuns) {
      const jobs = await settle(`jobs for run ${run.id}`, warnings, () => collector.workflowJobs!(run.id), [] as GitHubWorkflowJobSnapshot[]);
      for (const job of jobs) {
        evidence.push(ingestWorkflowJobSnapshot(repo, run.id, job), ...ingestWorkflowStepEvidence(repo, run.id, job));
      }
    }
  }

  // Pull-request depth
  const lifecycles: PullRequestLifecycle[] = [];
  const detailed = pullRequests.slice(0, options.maxPullRequestsDetailed ?? 10);
  const fileLimit = options.maxFilesPerPullRequest ?? 300;
  for (const pr of detailed) {
    const [reviews, comments, files, events] = await Promise.all([
      settle(`reviews for PR #${pr.number}`, warnings, collector.reviews ? () => collector.reviews!(pr.number) : undefined, [] as GitHubReviewSnapshot[]),
      settle(`comments for PR #${pr.number}`, warnings, collector.comments ? () => collector.comments!(pr.number) : undefined, [] as GitHubCommentSnapshot[]),
      settle(`files for PR #${pr.number}`, warnings, collector.pullRequestFiles ? () => collector.pullRequestFiles!(pr.number, fileLimit) : undefined, [] as GitHubPullRequestFileSnapshot[]),
      settle(`events for PR #${pr.number}`, warnings, collector.pullRequestEvents ? () => collector.pullRequestEvents!(pr.number) : undefined, [] as GitHubIssueEventSnapshot[]),
    ]);
    evidence.push(...reviews.map((review) => ingestReviewSnapshot(repo, review)), ...comments.map((comment) => ingestCommentSnapshot(repo, comment)));
    if (files.length) {
      const analysis = analyzeChangedFiles(files.map((file) => ({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions })));
      evidence.push(changeAnalysisToDiffEvidence(analysis, {
        baseCommit: pr.baseSha,
        headCommit: pr.headSha,
        sourceId: `github-pr:${repo}:${pr.number}`,
        timestamp: pr.updatedAt ?? pr.createdAt,
        truncated: files.length >= fileLimit && pr.changedFiles > files.length,
      }));
    }
    lifecycles.push(buildPullRequestLifecycle({ pullRequest: pr, commits, runs, reviews, comments, events }));
  }

  return { bundle: createEvidenceBundle(evidence), ci: summarizeCiHistory(runs), agentRuns, pullRequests: lifecycles, warnings };
}
