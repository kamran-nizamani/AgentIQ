import { describe, expect, it } from "vitest";
import { buildPullRequestLifecycle, deriveReviewDecision } from "../src/pr-lifecycle.js";
import type { GitHubPullRequestSnapshot } from "../src/github-intelligence.js";

const pr = (over: Partial<GitHubPullRequestSnapshot> = {}): GitHubPullRequestSnapshot => ({
  number: 7, title: "Fix", state: "closed", merged: true, baseSha: "base", headSha: "head",
  additions: 10, deletions: 2, changedFiles: 2, createdAt: "2026-10-08T00:00:00Z", mergedAt: "2026-10-08T05:00:00Z", labels: ["bug"], mergedBy: "maint", ...over,
});
const review = (id: number, user: string, state: string, at: string) => ({ id, pullRequestNumber: 7, user, state, submittedAt: at });
const run = (over: object) => ({ id: 1, name: "CI", status: "completed", conclusion: "success", headSha: "head", runNumber: 1, event: "pull_request", createdAt: "2026-10-08T00:10:00Z", updatedAt: "2026-10-08T00:20:00Z", ...over });

describe("review decision", () => {
  it("lets a later approval supersede an earlier request for changes by the same reviewer", () => {
    expect(deriveReviewDecision([review(1, "a", "CHANGES_REQUESTED", "2026-10-08T01:00:00Z"), review(2, "a", "APPROVED", "2026-10-08T02:00:00Z")])).toBe("approved");
  });
  it("keeps changes_requested while any reviewer still requests changes", () => {
    expect(deriveReviewDecision([review(1, "a", "APPROVED", "2026-10-08T01:00:00Z"), review(2, "b", "CHANGES_REQUESTED", "2026-10-08T02:00:00Z")])).toBe("changes_requested");
  });
  it("ignores plain comments and dismissed reviews", () => {
    expect(deriveReviewDecision([review(1, "a", "COMMENTED", "2026-10-08T01:00:00Z"), review(2, "b", "DISMISSED", "2026-10-08T02:00:00Z")])).toBe("review_required");
    expect(deriveReviewDecision([])).toBe("review_required");
  });
});

describe("pull request lifecycle", () => {
  it("builds the full commit -> PR -> CI -> review -> merge timeline", () => {
    const l = buildPullRequestLifecycle({
      pullRequest: pr(),
      commits: [{ sha: "head", message: "m", authoredAt: "2026-10-07T23:00:00Z" }],
      runs: [run({}), run({ id: 2, headSha: "other", conclusion: "failure" })],
      reviews: [review(1, "a", "CHANGES_REQUESTED", "2026-10-08T01:00:00Z"), review(2, "a", "APPROVED", "2026-10-08T03:00:00Z")],
      comments: [{ id: 1, pullRequestNumber: 7, body: "x", createdAt: "2026-10-08T01:00:00Z", path: "a.ts" }, { id: 2, pullRequestNumber: 7, body: "y", createdAt: "2026-10-08T01:05:00Z" }],
    });
    expect(l.stages.map((s) => s.stage)).toEqual(["commit", "pull-request", "ci", "review", "merge"]);
    expect(l.missingStages).toEqual([]);
    expect(l).toMatchObject({
      mergeStatus: "merged", decision: "approved", reviewCount: 2, approvals: 1, changesRequestedCount: 1,
      commentCount: 2, inlineCommentCount: 1, labels: ["bug"], reopenCount: 0,
      timeToFirstReviewMs: 3_600_000, timeToMergeMs: 18_000_000,
    });
    expect(l.ci).toEqual({ runs: 1, succeeded: 1, failed: 0, inProgress: 0, latestConclusion: "success" });
  });

  it("reports missing stages instead of assuming them, and counts reopenings", () => {
    const l = buildPullRequestLifecycle({
      pullRequest: pr(),
      events: [{ id: 1, event: "reopened", createdAt: "2026-10-08T02:00:00Z" }, { id: 2, event: "labeled", createdAt: "2026-10-08T02:00:00Z" }, { id: 3, event: "reopened", createdAt: "2026-10-08T03:00:00Z" }],
    });
    expect(l.missingStages).toEqual(expect.arrayContaining(["commit", "ci", "review"]));
    expect(l.reopenCount).toBe(2);
    expect(l.timeToFirstReviewMs).toBeNull();
  });

  it("derives merge status for open, draft and closed-unmerged PRs and has no merge time unless merged", () => {
    expect(buildPullRequestLifecycle({ pullRequest: pr({ state: "open", merged: false, mergedAt: null }) }).mergeStatus).toBe("open");
    expect(buildPullRequestLifecycle({ pullRequest: pr({ state: "open", merged: false, mergedAt: null, draft: true }) }).mergeStatus).toBe("draft");
    const closed = buildPullRequestLifecycle({ pullRequest: pr({ merged: false, mergedAt: null }) });
    expect(closed.mergeStatus).toBe("closed-unmerged");
    expect(closed.timeToMergeMs).toBeNull();
    expect(closed.missingStages).not.toContain("merge");
  });

  it("does not crash on unparseable CI timestamps", () => {
    const l = buildPullRequestLifecycle({ pullRequest: pr(), runs: [run({ updatedAt: "garbage" })] });
    expect(l.stages.map((s) => s.stage)).not.toContain("ci");
  });
});
