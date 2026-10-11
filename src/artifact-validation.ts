import type { EvidenceBundle } from "./evidence.js";
import { validateEvidenceBundle } from "./evidence-schema.js";

export interface ExpectedArtifactProvenance {
  repository: string;
  workflowRunId: string | number;
  commitSha: string;
}

export interface ArtifactValidationResult {
  valid: boolean;
  errors: string[];
  repository?: string;
  workflowRunId?: string;
  commitSha?: string;
  testSummary?: { framework: string; total: number; passed: number; failed: number; skipped: number };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Validate evidence artifacts against the exact repository, CI run, and commit that requested them. */
export function validateEvidenceArtifact(value: unknown, expected: ExpectedArtifactProvenance): ArtifactValidationResult {
  const errors: string[] = [];
  if (!validateEvidenceBundle(value)) {
    return { valid: false, errors: ["Invalid evidence bundle schema or unsupported schema version."] };
  }

  const bundle = value as EvidenceBundle;
  const workflow = bundle.evidence.find((item) => item.kind === "workflow-run");
  const tests = bundle.evidence.find((item) => item.kind === "test-suite");
  if (!workflow) errors.push("Missing workflow-run evidence.");
  if (!tests) errors.push("Missing parsed test-suite evidence.");

  const workflowData = record(workflow?.data);
  const testData = record(tests?.data);
  const expectedRunId = String(expected.workflowRunId);

  if (workflowData) {
    if (workflowData.repository !== expected.repository) errors.push("Workflow repository does not match the requested repository.");
    if (String(workflowData.workflowRunId ?? workflow.provenance.sourceId) !== expectedRunId) errors.push("Workflow run ID does not match the requested CI run.");
    if (workflowData.commitSha !== expected.commitSha) errors.push("Workflow commit SHA does not match the requested commit.");
  }

  if (testData) {
    if (testData.repository !== expected.repository) errors.push("Test evidence repository does not match the requested repository.");
    if (String(testData.workflowRunId ?? "") !== expectedRunId) errors.push("Test evidence run ID does not match the requested CI run.");
    if (testData.commitSha !== expected.commitSha) errors.push("Test evidence commit SHA does not match the requested commit.");
    const total = testData.total;
    const passed = testData.passed;
    const failed = testData.failed;
    const skipped = testData.skipped ?? 0;
    if (typeof testData.framework !== "string" || !testData.framework.trim()) errors.push("Test framework is missing.");
    if (![total, passed, failed, skipped].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) {
      errors.push("Test counts must be non-negative integers.");
    } else if ((passed as number) + (failed as number) + (skipped as number) !== total) {
      errors.push("Test counts are inconsistent: passed + failed + skipped must equal total.");
    }
    if (typeof total === "number" && total <= 0) errors.push("Test evidence must contain at least one test.");
  }

  return {
    valid: errors.length === 0,
    errors,
    repository: expected.repository,
    workflowRunId: expectedRunId,
    commitSha: expected.commitSha,
    ...(testData && typeof testData.framework === "string" &&
      typeof testData.total === "number" && typeof testData.passed === "number" &&
      typeof testData.failed === "number" ? {
        testSummary: {
          framework: testData.framework,
          total: testData.total,
          passed: testData.passed,
          failed: testData.failed,
          skipped: typeof testData.skipped === "number" ? testData.skipped : 0,
        },
      } : {}),
  };
}
