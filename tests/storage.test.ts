import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, evaluateEvidence } from "../src/evaluation.js";
import { createEvidenceBundle, ingestGitHubActionsRun, ingestTestEvidence } from "../src/ingestion.js";
import { evidenceBundleToAgentRun } from "../src/normalize.js";
import { InMemoryAgentRunStore, toRunHistoryRow, type StoredAgentRun } from "../src/storage.js";

function record(id = "42"): StoredAgentRun {
  const evidence = createEvidenceBundle([
    ...ingestGitHubActionsRun({ runId: id, workflowName: "CI", status: "completed", conclusion: "success", repository: "kamran-nizamani/AgentIQ", commitSha: "abc" }),
    ingestTestEvidence({ framework: "vitest", total: 10, passed: 10, failed: 0, sourceId: "tests:" + id })
  ]);
  const run = evidenceBundleToAgentRun(evidence);
  return { run, evidence, evaluation: evaluateEvidence(evidence, run, DEFAULT_POLICY), storedAt: "2026-10-09T00:00:00.000Z" };
}

describe("InMemoryAgentRunStore", () => {
  it("round-trips without sharing mutable state", async () => {
    const store = new InMemoryAgentRunStore(); await store.save(record());
    const loaded = await store.get("42"); loaded!.evidence.evidence.pop();
    expect((await store.get("42"))!.evidence.evidence).toHaveLength(2);
  });
  it("is idempotent for identical evidence", async () => {
    const store = new InMemoryAgentRunStore(); const value = record(); await store.save(value); await store.save(value);
    expect(await store.count()).toBe(1);
  });
  it("rejects conflicting evidence for an existing run id", async () => {
    const store = new InMemoryAgentRunStore(); await store.save(record());
    const different = record(); different.evidence = { ...different.evidence, evidence: [] };
    await expect(store.save(different)).rejects.toThrow("different evidence");
  });
  it("filters and orders history", async () => {
    const store = new InMemoryAgentRunStore(); await store.save(record("1"));
    await store.save({ ...record("2"), storedAt: "2026-10-10T00:00:00.000Z" });
    const rows = await store.list({ repository: "kamran-nizamani/AgentIQ", limit: 1 });
    expect(rows[0].run.id).toBe("2"); expect(toRunHistoryRow(rows[0]).repository).toBe("kamran-nizamani/AgentIQ");
  });
});
