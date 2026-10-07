import { describe, expect, it } from "vitest";
import { collectGitHubEvidence } from "../src/github-collector.js";
import { extractRiskSignals } from "../src/risk.js";
import { evaluateEvidence } from "../src/evaluation.js";
import { rankAgents } from "../src/benchmark.js";
import { summarizeEvaluations } from "../src/analytics.js";

const run={id:"r1",taskOutcome:"success" as const,tests:{total:10,passed:10,failed:0},changes:{filesChanged:2,linesAdded:40,linesDeleted:5},execution:{durationMs:1000},humanIntervention:{required:false,interventions:0},rollback:false};

describe("AgentIQ platform core",()=>{
 it("collects provider data into canonical evidence",async()=>{
  const bundle=await collectGitHubEvidence({repository:async()=>({fullName:"o/r",defaultBranch:"main"}),commits:async()=>[{sha:"abc",message:"feat",author:"agent"}],pullRequests:async()=>[{number:1,title:"feat",state:"closed",merged:true,baseSha:"a",headSha:"b",additions:10,deletions:2,changedFiles:1,createdAt:"2026-10-08T00:00:00Z"}]});
  expect(bundle.evidence).toHaveLength(3); expect(bundle.evidence[0].kind).toBe("repository"); expect(bundle.evidence[1].provenance.source).toBe("github");
 });
 it("derives risk signals from evidence",()=>{
  const signals=extractRiskSignals({schemaVersion:"1.0",evidence:[{id:"t",kind:"test-suite",timestamp:"2026-10-08T00:00:00Z",provenance:{source:"test-report",sourceId:"t",collectedAt:"2026-10-08T00:00:00Z",schemaVersion:"1.0"},data:{failed:3}}]});
  expect(signals[0].severity).toBe("medium");
 });
 it("evaluates with a validated policy and preserves evidence ids",()=>{
  const bundle={schemaVersion:"1.0" as const,evidence:[]};
  const report=evaluateEvidence(bundle,run);
  expect(report.evaluation.score).toBe(100); expect(report.evidenceIds).toEqual([]);
 });
 it("summarizes history and ranks agents",()=>{
  const evaluations=[{runId:"1",score:80,grade:"B" as const,breakdown:{outcome:80,tests:80,efficiency:80,autonomy:80,safety:80},recommendations:[]},{runId:"2",score:90,grade:"A" as const,breakdown:{outcome:90,tests:90,efficiency:90,autonomy:90,safety:90},recommendations:[]}];
  expect(summarizeEvaluations(evaluations).trend).toBe("improving");
  expect(rankAgents([{agentId:"a",evaluation:evaluations[0]},{agentId:"b",evaluation:evaluations[1]}])[0].agentId).toBe("b");
 });
});
