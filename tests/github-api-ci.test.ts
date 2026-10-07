import {describe,expect,it} from "vitest";
import {GitHubApiCollector} from "../src/github-api.js";
const resp=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
describe("GitHub API CI resources",()=>{
 it("collects workflow runs and jobs",async()=>{
  const fetchImpl=async(url:string|URL|Request)=>{
   const u=String(url);
   if(u.includes("/actions/runs/42/jobs")) return resp([{id:9,name:"tests",status:"completed",conclusion:"success",started_at:"2026-10-08T00:00:00Z",completed_at:"2026-10-08T00:01:00Z",steps:[{name:"npm test",status:"completed",conclusion:"success",number:1}]}]);
   if(u.includes("/actions/runs?")) return resp([{id:42,name:"CI",status:"completed",conclusion:"success",head_sha:"abc",run_number:8,event:"push",created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:01:00Z"}]);
   throw new Error(u);
  };
  const c=new GitHubApiCollector("o/r",{fetchImpl});
  expect(await c.workflowRuns(1)).toMatchObject([{id:42,conclusion:"success"}]);
  expect(await c.workflowJobs(42,1)).toMatchObject([{id:9,steps:[{name:"npm test",conclusion:"success"}]}]);
 });
 it("collects PR reviews and inline comments",async()=>{
  const fetchImpl=async(url:string|URL|Request)=>{
   const u=String(url);
   if(u.includes("/reviews?")) return resp([{id:3,user:{login:"reviewer"},state:"APPROVED",submitted_at:"2026-10-08T00:00:00Z",body:"LGTM"}]);
   if(u.includes("/comments?")) return resp([{id:4,user:{login:"reviewer"},body:"Add a test",created_at:"2026-10-08T00:00:00Z",path:"src/a.ts",line:12}]);
   throw new Error(u);
  };
  const c=new GitHubApiCollector("o/r",{fetchImpl});
  expect(await c.reviews(7,1)).toMatchObject([{id:3,user:"reviewer",state:"APPROVED"}]);
  expect(await c.comments(7,1)).toMatchObject([{id:4,path:"src/a.ts",line:12}]);
 });
});