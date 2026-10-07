import { describe, expect, it } from "vitest";
import { createEvidenceBundle, ingestGitDiffEvidence, ingestGitHubActionsRun, ingestPullRequestEvidence, ingestTestEvidence } from "../src/ingestion.js";
import { validateEvidenceBundle } from "../src/evidence-schema.js";
describe("evidence ingestion",()=>{
  it("normalizes GitHub Actions metadata",()=>{
    const [e]=ingestGitHubActionsRun({runId:42,workflowName:"agent-evaluation",status:"completed",conclusion:"success",repository:"kamran-nizamani/AgentIQ",commitSha:"abc123",prNumber:3});
    expect(e.kind).toBe("workflow-run"); expect(e.provenance.source).toBe("github-actions");
    expect(e.data).toMatchObject({conclusion:"success",prNumber:3});
  });
  it("normalizes test, diff, and PR evidence",()=>{
    const b=createEvidenceBundle([
      ingestTestEvidence({framework:"vitest",total:10,passed:9,failed:1,sourceId:"test-1"}),
      ingestGitDiffEvidence({baseCommit:"base",headCommit:"head",filesChanged:4,linesAdded:80,linesDeleted:20,sourceId:"compare-1"}),
      ingestPullRequestEvidence({number:3,repository:"kamran-nizamani/AgentIQ",state:"open",merged:false,sourceId:"pr-3",createdAt:"2026-10-08T00:00:00.000Z"})
    ]);
    expect(validateEvidenceBundle(b)).toBe(true); expect(b.evidence).toHaveLength(3);
  });
  it("rejects wrong schema version",()=>{expect(validateEvidenceBundle({schemaVersion:"0.0",evidence:[]})).toBe(false);});
});