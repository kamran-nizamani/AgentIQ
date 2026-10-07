import type { AgentEvaluation } from "./types.js";

export interface TrendPoint { runId:string; score:number; grade:AgentEvaluation["grade"]; }
export interface HistoricalSummary { count:number; averageScore:number; bestScore:number; worstScore:number; passRate:number; trend:"improving"|"declining"|"stable"; }

export function summarizeEvaluations(evaluations:AgentEvaluation[]): HistoricalSummary {
  if(!evaluations.length) return {count:0,averageScore:0,bestScore:0,worstScore:0,passRate:0,trend:"stable"};
  const scores=evaluations.map(e=>e.score);
  const averageScore=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
  const half=Math.max(1,Math.floor(scores.length/2));
  const first=scores.slice(0,half).reduce((a,b)=>a+b,0)/half;
  const recent=scores.slice(-half).reduce((a,b)=>a+b,0)/half;
  const delta=recent-first;
  return {count:scores.length,averageScore,bestScore:Math.max(...scores),worstScore:Math.min(...scores),passRate:Math.round(scores.filter(s=>s>=60).length/scores.length*100),trend:delta>=3?"improving":delta<=-3?"declining":"stable"};
}
export function toTrend(evaluations:AgentEvaluation[]):TrendPoint[]{return evaluations.map(e=>({runId:e.runId,score:e.score,grade:e.grade}));}
