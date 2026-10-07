import type { Evidence, EvidenceBundle, GitDiffEvidenceInput, GitHubActionsEvidenceInput, PullRequestEvidenceInput, TestEvidenceInput } from "./evidence.js";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence-schema.js";
const now=()=>new Date().toISOString();
function makeEvidence(id:string,kind:Evidence["kind"],source:Evidence["provenance"]["source"],sourceId:string,data:Record<string,unknown>,timestamp=now()):Evidence {
  return {id,kind,timestamp,provenance:{source,sourceId,collectedAt:now(),schemaVersion:EVIDENCE_SCHEMA_VERSION},data};
}
export function ingestGitHubActionsRun(input:GitHubActionsEvidenceInput):Evidence[] {
  return [makeEvidence("github-actions:run:"+input.runId,"workflow-run","github-actions",String(input.runId),{
    workflowName:input.workflowName,status:input.status,conclusion:input.conclusion??null,
    repository:input.repository,commitSha:input.commitSha,prNumber:input.prNumber??null
  },input.completedAt??input.startedAt??now())];
}
export function ingestTestEvidence(input:TestEvidenceInput):Evidence {
  return makeEvidence("test-suite:"+input.sourceId,"test-suite","test-report",input.sourceId,{
    framework:input.framework,total:input.total,passed:input.passed,failed:input.failed,skipped:input.skipped??0,durationMs:input.durationMs??null
  });
}
export function ingestGitDiffEvidence(input:GitDiffEvidenceInput):Evidence {
  return makeEvidence("git-diff:"+input.sourceId,"diff","git-diff",input.sourceId,{
    baseCommit:input.baseCommit,headCommit:input.headCommit,filesChanged:input.filesChanged,linesAdded:input.linesAdded,linesDeleted:input.linesDeleted
  });
}
export function ingestPullRequestEvidence(input:PullRequestEvidenceInput):Evidence {
  return makeEvidence("pull-request:"+input.repository+":"+input.number,"pull-request","pull-request",input.sourceId,{
    number:input.number,repository:input.repository,state:input.state,merged:input.merged,createdAt:input.createdAt,updatedAt:input.updatedAt??null,mergedAt:input.mergedAt??null
  },input.updatedAt??input.createdAt);
}
export function createEvidenceBundle(evidence:Evidence[]):EvidenceBundle { return {schemaVersion:EVIDENCE_SCHEMA_VERSION,evidence:[...evidence]}; }