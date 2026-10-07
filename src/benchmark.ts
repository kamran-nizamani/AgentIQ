import type { AgentEvaluation } from "./types.js";

export interface BenchmarkRun { agentId:string; evaluation:AgentEvaluation; }
export interface BenchmarkEntry { agentId:string; runs:number; averageScore:number; successRate:number; rank:number; }

export function rankAgents(runs:BenchmarkRun[]):BenchmarkEntry[]{
  const grouped=new Map<string,AgentEvaluation[]>();
  for(const r of runs){const list=grouped.get(r.agentId)??[];list.push(r.evaluation);grouped.set(r.agentId,list);}
  const entries=[...grouped].map(([agentId,es])=>({agentId,runs:es.length,averageScore:Math.round(es.reduce((a,e)=>a+e.score,0)/es.length),successRate:Math.round(es.filter(e=>e.score>=60).length/es.length*100),rank:0}));
  entries.sort((a,b)=>b.averageScore-a.averageScore||b.successRate-a.successRate);
  entries.forEach((e,i)=>e.rank=i+1);
  return entries;
}
