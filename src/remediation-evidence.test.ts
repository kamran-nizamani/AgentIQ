import { describe, expect, it } from "vitest";
import { buildDiffEvidence, formatApprovalAuditComment } from "./remediation-evidence.js";

describe("buildDiffEvidence", () => {
  it("uses actual file patches and proposes regression coverage when no test file changed", () => {
    const result = buildDiffEvidence([
      { filename: "src/fix.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" },
    ], [{ id: 12, name: "CI", html_url: "https://github.com/acme/demo/actions/runs/12", status: "completed", conclusion: "success" }]);
    expect(result.files[0].patch).toContain("+new");
    expect(result.evidence.filesWithPatch).toBe(1);
    expect(result.testsChanged).toBe(false);
    expect(result.proposals[0].id).toBe("regression-test-coverage");
    expect(result.workflowRuns[0].conclusion).toBe("success");
  });

  it("detects dependency, workflow, and test paths from GitHub file metadata", () => {
    const result = buildDiffEvidence([
      { filename: "package-lock.json", status: "modified", additions: 4, deletions: 2, patch: "@@ lock" },
      { filename: ".github/workflows/ci.yml", status: "modified", additions: 1, deletions: 1, patch: "@@ workflow" },
      { filename: "src/fix.test.ts", status: "added", additions: 9, deletions: 0, patch: "@@ test" },
    ], []);
    expect(result.testsChanged).toBe(true);
    expect(result.changedTests).toEqual(["src/fix.test.ts"]);
    expect(result.proposals.map((proposal) => proposal.id)).toContain("dependency-validation");
    expect(result.proposals.map((proposal) => proposal.id)).toContain("workflow-permissions");
  });

  it("does not call absent patches or missing workflow evidence successful", () => {
    const result = buildDiffEvidence([{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 0 }], []);
    expect(result.files[0].patchAvailable).toBe(false);
    expect(result.evidence.workflowRunsFound).toBe(0);
    expect(result.evidence.note).toContain("unknown");
  });
});

describe("formatApprovalAuditComment", () => {
  it("creates a persistent, decision-specific audit entry without claiming identity verification", () => {
    const comment = formatApprovalAuditComment({
      proposalId: "regression-test-coverage",
      decision: "approved",
      repository: "acme/demo",
      pullNumber: 12,
      headSha: "abc123",
      checks: { evidenceReviewed: true, testsDefined: true, rollbackDefined: true, diffReviewed: true },
      recordedAt: "2026-10-12T08:00:00.000Z",
    });
    expect(comment).toContain("agentiq-remediation-audit:v1");
    expect(comment).toContain("Decision: **APPROVED**");
    expect(comment).toContain("Reviewed head commit: `abc123`");
    expect(comment).toContain("identity is not independently verified");
    expect(comment).toContain("did not apply code");
  });
});
