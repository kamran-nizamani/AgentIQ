import type { Evidence } from "./evidence.js";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence-schema.js";

export interface GitHubWorkflowRunSnapshot { id:number; name:string; status:string; conclusion?:string|null; headSha:string; runNumber:number; event:string; branch?:string|null; createdAt:string; updatedAt:string; runAttempt?:number; workflowPath?:string|null; htmlUrl?:string|null; }
export interface GitHubWorkflowJobSnapshot { id:number; name:string; status:string; conclusion?:string|null; startedAt?:string|null; completedAt?:string|null; runnerName?:string|null; steps?:Array<{name:string;status:string;conclusion?:string|null;number?:number}>; htmlUrl?:string|null; }
export interface GitHubReviewSnapshot { id:number; pullRequestNumber:number; user?:string|null; state:string; submittedAt?:string|null; body?:string|null; }
export interface GitHubCommentSnapshot { id:number; pullRequestNumber:number; user?:string|null; body:string; createdAt:string; updatedAt?:string|null; path?:string|null; line?:number|null; }

const now=()=>new Date().toISOString();
function make(id:string,kind:Evidence["kind"],sourceId:string,data:Record<string,unknown>,timestamp?:string):Evidence{return{id,kind,timestamp:timestamp??now(),provenance:{source:"github",sourceId,collectedAt:now(),schemaVersion:EVIDENCE_SCHEMA_VERSION},data};}
export function ingestWorkflowRunSnapshot(repo:string,run:GitHubWorkflowRunSnapshot):Evidence{return make("github:workflow:"+repo+":"+run.id,"workflow-run",String(run.id),{repository:repo,...run});}
export function ingestWorkflowJobSnapshot(repo:string,runId:number,job:GitHubWorkflowJobSnapshot):Evidence{return make("github:workflow-job:"+repo+":"+job.id,"workflow-job",String(job.id),{repository:repo,runId,...job},job.completedAt??job.startedAt??undefined);}
export function ingestReviewSnapshot(repo:string,review:GitHubReviewSnapshot):Evidence{return make("github:review:"+repo+":"+review.pullRequestNumber+":"+review.id,"review",String(review.id),{repository:repo,...review},review.submittedAt??undefined);}
export function ingestCommentSnapshot(repo:string,comment:GitHubCommentSnapshot):Evidence{return make("github:comment:"+repo+":"+comment.pullRequestNumber+":"+comment.id,"comment",String(comment.id),{repository:repo,...comment},comment.updatedAt??comment.createdAt);}
