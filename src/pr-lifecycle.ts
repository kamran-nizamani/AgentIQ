import type { GitHubCommentSnapshot, GitHubReviewSnapshot, GitHubWorkflowRunSnapshot } from "./github-ci.js";
import type { GitHubCommitSnapshot, GitHubIssueEventSnapshot, GitHubPullRequestSnapshot } from "./github-intelligence.js";

/**
 * The lifecycle AgentIQ is meant to explain:
 *
 *   Agent Run -> Commit -> PR -> CI -> Review -> Merge
 *
 * Everything is derived from collected snapshots. A stage with no evidence is
 * reported as missing, never assumed to have happened.
 */

export type LifecycleStageName = "commit" | "pull-request" | "ci" | "review" | "merge";
export interface LifecycleStage { stage: LifecycleStageName; at: string; detail: string; }

export type ReviewDecision = "approved" | "changes_requested" | "review_required";
export type MergeStatus = "merged" | "closed-unmerged" | "open" | "draft";

export interface PullRequestLifecycle {
  pullRequest: number;
  mergeStatus: MergeStatus;
  labels: string[];
  stages: LifecycleStage[];
  /** Stages that have no evidence. A merged PR with no review stage is worth noticing, not assuming. */
  missingStages: LifecycleStageName[];
  reviewCount: number;
  reviewers: string[];
  approvals: number;
  changesRequestedCount: number;
  decision: ReviewDecision;
  commentCount: number;
  inlineCommentCount: number;
  reopenCount: number;
  ci: { runs: number; succeeded: number; failed: number; inProgress: number; latestConclusion: string | null };
  timeToFirstReviewMs: number | null;
  timeToMergeMs: number | null;
}

export interface PullRequestLifecycleInput {
  pullRequest: GitHubPullRequestSnapshot;
  commits?: GitHubCommitSnapshot[];
  /** Workflow runs; only those whose head commit is the PR head are counted as this PR's CI. */
  runs?: GitHubWorkflowRunSnapshot[];
  reviews?: GitHubReviewSnapshot[];
  comments?: GitHubCommentSnapshot[];
  events?: GitHubIssueEventSnapshot[];
}

const time = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Normalize GitHub's upper-case review states (APPROVED, CHANGES_REQUESTED, ...) and our lower-case ones. */
function reviewState(state: string): "approved" | "changes_requested" | "commented" | "dismissed" | "pending" {
  const value = state.toLowerCase();
  if (value === "approved") return "approved";
  if (value === "changes_requested") return "changes_requested";
  if (value === "dismissed") return "dismissed";
  if (value === "pending") return "pending";
  return "commented";
}

/**
 * Derive the decision the way GitHub does: the latest decisive review of each
 * reviewer counts. A later approval supersedes that reviewer's earlier request
 * for changes; plain comments and dismissed reviews do not change a decision.
 */
export function deriveReviewDecision(reviews: GitHubReviewSnapshot[]): ReviewDecision {
  const latest = new Map<string, { at: number; state: "approved" | "changes_requested" }>();
  for (const review of reviews) {
    const state = reviewState(review.state);
    if (state !== "approved" && state !== "changes_requested") continue;
    const reviewer = review.user ?? `unknown:${review.id}`;
    const at = time(review.submittedAt) ?? 0;
    const current = latest.get(reviewer);
    if (!current || at >= current.at) latest.set(reviewer, { at, state });
  }
  const states = [...latest.values()].map((entry) => entry.state);
  if (states.includes("changes_requested")) return "changes_requested";
  if (states.includes("approved")) return "approved";
  return "review_required";
}

export function buildPullRequestLifecycle(input: PullRequestLifecycleInput): PullRequestLifecycle {
  const pr = input.pullRequest;
  const reviews = (input.reviews ?? []).filter((review) => reviewState(review.state) !== "pending");
  const comments = input.comments ?? [];
  const events = input.events ?? [];
  const ciRuns = (input.runs ?? []).filter((run) => run.headSha === pr.headSha);

  const stages: LifecycleStage[] = [];
  const headCommit = (input.commits ?? []).find((commit) => commit.sha === pr.headSha);
  if (headCommit?.authoredAt) {
    stages.push({ stage: "commit", at: headCommit.authoredAt, detail: `Head commit ${pr.headSha.slice(0, 7)}` });
  }
  stages.push({ stage: "pull-request", at: pr.createdAt, detail: `PR #${pr.number} opened` });

  const ciTimes = ciRuns.map((run) => time(run.updatedAt)).filter((value): value is number => value !== null);
  if (ciRuns.length && ciTimes.length) {
    const finished = ciRuns.filter((run) => run.status === "completed");
    const last = finished.length ? finished.reduce((a, b) => (time(a.updatedAt) ?? 0) >= (time(b.updatedAt) ?? 0) ? a : b) : null;
    stages.push({
      stage: "ci",
      at: new Date(Math.max(...ciTimes)).toISOString(),
      detail: last ? `Latest CI run ${last.conclusion ?? last.status}` : "CI running",
    });
  }

  const submitted = reviews.map((review) => time(review.submittedAt)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (reviews.length && submitted.length) {
    stages.push({ stage: "review", at: new Date(submitted[0]!).toISOString(), detail: `${reviews.length} review(s)` });
  }
  if (pr.merged && pr.mergedAt) {
    stages.push({ stage: "merge", at: pr.mergedAt, detail: `Merged${pr.mergedBy ? ` by ${pr.mergedBy}` : ""}` });
  }
  stages.sort((a, b) => (time(a.at) ?? 0) - (time(b.at) ?? 0));

  const present = new Set(stages.map((stage) => stage.stage));
  const expected: LifecycleStageName[] = ["commit", "pull-request", "ci", "review", ...(pr.merged ? (["merge"] as const) : [])];
  const missingStages = expected.filter((stage) => !present.has(stage));

  const created = time(pr.createdAt);
  const merged = time(pr.mergedAt);
  const firstReview = submitted[0] ?? null;

  const mergeStatus: MergeStatus = pr.merged ? "merged" : pr.state === "closed" ? "closed-unmerged" : pr.draft ? "draft" : "open";
  const decision = reviews.length ? deriveReviewDecision(reviews) : (pr.reviewDecision ?? "review_required");

  const success = ciRuns.filter((run) => run.conclusion === "success").length;
  const failure = ciRuns.filter((run) => run.conclusion === "failure" || run.conclusion === "timed_out").length;
  const newestRun = [...ciRuns].sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0))[0];

  return {
    pullRequest: pr.number,
    mergeStatus,
    labels: pr.labels ?? [],
    stages,
    missingStages,
    reviewCount: reviews.length,
    reviewers: [...new Set(reviews.map((review) => review.user).filter((user): user is string => Boolean(user)))],
    approvals: reviews.filter((review) => reviewState(review.state) === "approved").length,
    changesRequestedCount: reviews.filter((review) => reviewState(review.state) === "changes_requested").length,
    decision,
    commentCount: comments.length,
    inlineCommentCount: comments.filter((comment) => Boolean(comment.path)).length,
    reopenCount: events.filter((event) => event.event === "reopened").length,
    ci: {
      runs: ciRuns.length,
      succeeded: success,
      failed: failure,
      inProgress: ciRuns.filter((run) => run.status !== "completed").length,
      latestConclusion: newestRun?.status === "completed" ? (newestRun.conclusion ?? null) : null,
    },
    timeToFirstReviewMs: created !== null && firstReview !== null && firstReview >= created ? firstReview - created : null,
    timeToMergeMs: created !== null && merged !== null && merged >= created ? merged - created : null,
  };
}
