import { describe, expect, it } from "vitest";
import { createEvidenceBundle, ingestGitHubActionsRun, ingestTestEvidence, ingestGitDiffEvidence, evidenceBundleToAgentRun } from "../src/index.js";

describe("evidence to AgentRun",()=>{
  it("builds the canonical evaluation input without changing the evaluator",()=>{
    const bundle=createEvidenceBundle([
      ...ingestGitHubActionsRun({runId:99,workflowName:"agent",status:"completed",conclusion:"success",repository:"org/repo",commitSha:"head",startedAt:"2026-10-08T00:00:00.000Z",completedAt:"2026-10-08T00:01:30.000Z"}),
      ingestTestEvidence({framework:"vitest",total:4,passed:4,failed:0,sourceId:"suite"}),
      ingestGitDiffEvidence({baseCommit:"base",headCommit:"head",filesChanged:2,linesAdded:20,linesDeleted:4,sourceId:"diff"})
    ]);
    const run=evidenceBundleToAgentRun(bundle);
    expect(run).toMatchObject({id:"99",taskOutcome:"success",tests:{total:4,passed:4,failed:0},changes:{filesChanged:2,linesAdded:20,linesDeleted:4},execution:{durationMs:90000}});
  });
});
