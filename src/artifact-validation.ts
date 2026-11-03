import type { EvidenceBundle } from "./evidence.js";
import { validateEvidenceBundle } from "./evidence-schema.js";

export interface ExpectedArtifactProvenance { repository: string; workflowRunId: string | number; commitSha: string; }
export interface AgentAttribution {
  status: "verified" | "unattributed";
  provider: string | null; name: string | null; version: string | null;
  modelProvider: string | null; modelName: string | null; modelVersion: string | null;
  taskId: string | null; taskDescription: string | null;
}
export interface ArtifactValidationResult {
  valid: boolean; errors: string[]; repository?: string; workflowRunId?: string; commitSha?: string;
  testSummary?: { framework: string; total: number; passed: number; failed: number; skipped: number };
  agentAttribution?: AgentAttribution;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function nonEmpty(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
/** Validate an original-run artifact and bind records to the exact repository, run and commit. */
export function validateEvidenceArtifact(value: unknown, expected: ExpectedArtifactProvenance): ArtifactValidationResult {
  const errors: string[] = [];
  if (!validateEvidenceBundle(value)) return { valid: false, errors: ["Invalid evidence bundle schema or unsupported schema version."] };
  const bundle = value as EvidenceBundle;
  const workflows = bundle.evidence.filter((item) => item.kind === "workflow-run");
  const testSuites = bundle.evidence.filter((item) => item.kind === "test-suite");
  const agentRuns = bundle.evidence.filter((item) => item.kind === "agent-run");
  if (workflows.length === 0) errors.push("Missing workflow-run evidence.");
  if (testSuites.length === 0) errors.push("Missing parsed test-suite evidence.");
  if (workflows.length > 1) errors.push("Evidence artifact must contain exactly one workflow-run record.");
  if (testSuites.length > 1) errors.push("Evidence artifact must contain exactly one test-suite record.");
  if (agentRuns.length > 1) errors.push("Evidence artifact must contain at most one agent-run record.");
  const workflow = workflows[0], tests = testSuites[0], agentRun = agentRuns[0];
  const workflowData = record(workflow?.data), testData = record(tests?.data), agentData = record(agentRun?.data);
  const workflowProvenance = record(workflow?.provenance), testProvenance = record(tests?.provenance), agentProvenance = record(agentRun?.provenance);
  const runId = String(expected.workflowRunId);
  const expectedTestSourceId = "vitest:" + runId + ":" + expected.commitSha;
  if (workflowData) {
    if (workflowData.repository !== expected.repository) errors.push("Workflow repository does not match the requested repository.");
    if (String(workflowData.workflowRunId ?? "") !== runId) errors.push("Workflow run ID does not match the requested CI run.");
    if (workflowData.commitSha !== expected.commitSha) errors.push("Workflow commit SHA does not match the requested commit.");
  }
  if (workflow && (workflow.id !== "github-actions:run:" + runId || !workflowProvenance ||
      workflowProvenance.source !== "github-actions" || workflowProvenance.sourceId !== runId)) {
    errors.push("Workflow evidence provenance source does not match the requested CI run.");
  }
  if (testData) {
    if (testData.repository !== expected.repository) errors.push("Test evidence repository does not match the requested repository.");
    if (String(testData.workflowRunId ?? "") !== runId) errors.push("Test evidence run ID does not match the requested CI run.");
    if (testData.commitSha !== expected.commitSha) errors.push("Test evidence commit SHA does not match the requested commit.");
    const { total, passed, failed } = testData, skipped = testData.skipped ?? 0;
    if (!nonEmpty(testData.framework, 100)) errors.push("Test framework is missing.");
    if (![total, passed, failed, skipped].every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) errors.push("Test counts must be non-negative integers.");
    else if ((passed as number) + (failed as number) + (skipped as number) !== total) errors.push("Test counts are inconsistent: passed + failed + skipped must equal total.");
    if (typeof total === "number" && total <= 0) errors.push("Test evidence must contain at least one test.");
  }
  if (tests && (tests.id !== "test-suite:vitest:" + runId || !testProvenance ||
      testProvenance.source !== "test-report" || testProvenance.sourceId !== expectedTestSourceId)) {
    errors.push("Test evidence provenance source does not match the requested CI run and commit.");
  }
  let agentAttribution: AgentAttribution = {
    status: "unattributed", provider: null, name: null, version: null,
    modelProvider: null, modelName: null, modelVersion: null, taskId: null, taskDescription: null,
  };
  if (agentRun) {
    const agent = record(agentData?.agent), model = record(agentData?.model), task = record(agentData?.task);
    const sourceId = "agent-metadata:" + runId + ":" + expected.commitSha;
    const provenanceMatches = !!agentData && agentData.repository === expected.repository &&
      String(agentData.workflowRunId ?? "") === runId && agentData.commitSha === expected.commitSha &&
      agentRun.id === "agent-run:" + runId && !!agentProvenance &&
      agentProvenance.source === "agent-metadata" && agentProvenance.sourceId === sourceId;
    if (!provenanceMatches) errors.push("Agent metadata provenance does not match the requested repository, run, and commit.");
    const identityValid = !!agent && nonEmpty(agent.provider, 100) && nonEmpty(agent.name, 120);
    const taskValid = !!task && nonEmpty(task.id, 160) && nonEmpty(task.description, 1000);
    if (!identityValid) errors.push("Agent metadata must include a provider and agent name.");
    if (!taskValid) errors.push("Agent metadata must include a task ID and description.");
    if (model && ((model.provider !== undefined && !nonEmpty(model.provider, 100)) ||
        (model.name !== undefined && !nonEmpty(model.name, 120)) ||
        (model.version !== undefined && !nonEmpty(model.version, 120)))) errors.push("Model metadata contains an invalid field.");
    if (provenanceMatches && identityValid && taskValid) {
      agentAttribution = {
        status: "verified", provider: agent.provider as string, name: agent.name as string,
        version: typeof agent.version === "string" ? agent.version : null,
        modelProvider: typeof model?.provider === "string" ? model.provider : null,
        modelName: typeof model?.name === "string" ? model.name : null,
        modelVersion: typeof model?.version === "string" ? model.version : null,
        taskId: task.id as string, taskDescription: task.description as string,
      };
    }
  }
  return {
    valid: errors.length === 0, errors, repository: expected.repository, workflowRunId: runId, commitSha: expected.commitSha,
    ...(testData && typeof testData.framework === "string" && typeof testData.total === "number" &&
      typeof testData.passed === "number" && typeof testData.failed === "number" ? {
        testSummary: { framework: testData.framework, total: testData.total, passed: testData.passed, failed: testData.failed, skipped: typeof testData.skipped === "number" ? testData.skipped : 0 },
      } : {}),
    agentAttribution,
  };
}
