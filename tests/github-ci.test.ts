import {describe,expect,it} from "vitest";
import {ingestCommentSnapshot,ingestReviewSnapshot,ingestWorkflowJobSnapshot,ingestWorkflowRunSnapshot} from "../src/github-ci.js";
describe("GitHub CI intelligence",()=>{
 it("normalizes workflow runs",()=>{const e=ingestWorkflowRunSnapshot("o/r",{id:1,name:"CI",status:"completed",conclusion:"success",headSha:"abc",runNumber:3,event:"push",createdAt:"2026-10-08T00:00:00Z",updatedAt:"2026-10-08T00:05:00Z"});expect(e.kind).toBe("workflow-run");expect(e.data).toMatchObject({conclusion:"success",headSha:"abc"});});
 it("normalizes job and step telemetry",()=>{const e=ingestWorkflowJobSnapshot("o/r",1,{id:2,name:"tests",status:"completed",conclusion:"failure",steps:[{name:"test",status:"completed",conclusion:"failure"}]});expect(e.kind).toBe("workflow-job");});
 it("normalizes review and comment evidence",()=>{const r=ingestReviewSnapshot("o/r",{id:3,pullRequestNumber:7,state:"approved",user:"reviewer"});const c=ingestCommentSnapshot("o/r",{id:4,pullRequestNumber:7,body:"Please add a test",createdAt:"2026-10-08T00:00:00Z"});expect(r.kind).toBe("review");expect(c.kind).toBe("comment");});
});