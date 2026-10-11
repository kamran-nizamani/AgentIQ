import { describe, expect, it } from "vitest";
import { validateEvidenceArtifact } from "../src/artifact-validation.js";

const expected = { repository: "owner/repo", workflowRunId: 12345, commitSha: "abc123def456" };

function artifact(overrides: { repository?: string; workflowRunId?: number; commitSha?: string; passed?: number; failed?: number } = {}) {
  const repository = overrides.repository ?? expected.repository;
  const workflowRunId = overrides.workflowRunId ?? expected.workflowRunId;
  const commitSha = overrides.commitSha ?? expected.commitSha;
  const provenance = (sourceId: string) => ({
    source: "github-actions",
    sourceId,
    collectedAt: "2026-10-11T19:00:00.000Z",
    schemaVersion: "1.0",
  });
  return {
    schemaVersion: "1.0",
    evidence: [
      {
        id: "github-actions:run:" + workflowRunId,
        kind: "workflow-run",
        timestamp: "2026-10-11T19:00:00.000Z",
        provenance: provenance(String(workflowRunId)),
        data: { repository, workflowRunId, commitSha, workflowName: "CI" },
      },
      {
        id: "test-suite:vitest:" + workflowRunId,
        kind: "test-suite",
        timestamp: "2026-10-11T19:00:00.000Z",
        provenance: { ...provenance("vitest:" + workflowRunId), source: "test-report" },
        data: {
          repository,
          workflowRunId,
          commitSha,
          framework: "vitest",
          total: 10,
          passed: overrides.passed ?? 10,
          failed: overrides.failed ?? 0,
          skipped: 0,
        },
      },
    ],
  };
}

describe("evidence artifact provenance validation", () => {
  it("accepts a complete artifact tied to the expected repository, run, and commit", () => {
    const result = validateEvidenceArtifact(artifact(), expected);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.testSummary).toEqual({ framework: "vitest", total: 10, passed: 10, failed: 0, skipped: 0 });
  });

  it("rejects repository, run, and commit mismatches", () => {
    const result = validateEvidenceArtifact(artifact({
      repository: "someone/else",
      workflowRunId: 999,
      commitSha: "wrongsha",
    }), expected);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow repository does not match the requested repository.");
    expect(result.errors).toContain("Workflow run ID does not match the requested CI run.");
    expect(result.errors).toContain("Workflow commit SHA does not match the requested commit.");
  });

  it("rejects missing test evidence and inconsistent counts", () => {
    const noTests = artifact();
    noTests.evidence = noTests.evidence.filter((item) => item.kind !== "test-suite");
    expect(validateEvidenceArtifact(noTests, expected).errors).toContain("Missing parsed test-suite evidence.");

    const inconsistent = validateEvidenceArtifact(artifact({ passed: 9, failed: 0 }), expected);
    expect(inconsistent.valid).toBe(false);
    expect(inconsistent.errors).toContain("Test counts are inconsistent: passed + failed + skipped must equal total.");
  });

  it("rejects unsupported or malformed bundle schemas", () => {
    expect(validateEvidenceArtifact({ schemaVersion: "2.0", evidence: [] }, expected)).toMatchObject({
      valid: false,
      errors: ["Invalid evidence bundle schema or unsupported schema version."],
    });
  });
});
