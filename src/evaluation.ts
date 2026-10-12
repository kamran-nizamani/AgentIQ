import type { AgentEvaluation, AgentRun } from "./types.js";
import { evaluateAgentRun } from "./scoring.js";
import type { EvidenceBundle } from "./evidence.js";
import { extractRiskSignals, type RiskSignal } from "./risk.js";

export interface EvaluationPolicy { id:string; outcomeWeight:number; testsWeight:number; efficiencyWeight:number; autonomyWeight:number; safetyWeight:number; }
export const DEFAULT_POLICY: EvaluationPolicy={id:"default-engineering-v1",outcomeWeight:.35,testsWeight:.30,efficiencyWeight:.15,autonomyWeight:.10,safetyWeight:.10};

export interface EvidenceCoverage { tests:boolean; safety:boolean; availableWeight:number; provisional:boolean; missing:string[]; }
export interface ScoreDimensionExplanation {
  key: "outcome" | "tests" | "efficiency" | "autonomy" | "safety";
  label: string;
  score: number | null;
  baseWeight: number;
  appliedWeight: number;
  contribution: number;
  available: boolean;
  reason: string;
}
export interface EvaluationReport { evaluation:AgentEvaluation; policy:EvaluationPolicy; riskSignals:RiskSignal[]; evidenceIds:string[]; evidenceCoverage:EvidenceCoverage; scoreStatus:"verified"|"provisional"; scoreExplanation:ScoreDimensionExplanation[]; }

export function evaluateEvidence(bundle:EvidenceBundle, run:AgentRun, policy:EvaluationPolicy=DEFAULT_POLICY): EvaluationReport {
  const sum=policy.outcomeWeight+policy.testsWeight+policy.efficiencyWeight+policy.autonomyWeight+policy.safetyWeight;
  if(Math.abs(sum-1)>1e-9) throw new Error("Evaluation policy weights must sum to 1.");
  const base=evaluateAgentRun(run);
  const b=base.breakdown;
  const testsAvailable=bundle.evidence.some(e=>e.kind==="test-suite");
  const safetyAvailable=bundle.evidence.some(e=>e.kind==="diff");
  const missing:string[]=[];
  if(!testsAvailable) missing.push("Parsed test report");
  if(!safetyAvailable) missing.push("Code diff");
  const availableWeight=policy.outcomeWeight+policy.efficiencyWeight+policy.autonomyWeight+(testsAvailable?policy.testsWeight:0)+(safetyAvailable?policy.safetyWeight:0);
  const weightedScore=b.outcome*policy.outcomeWeight+b.efficiency*policy.efficiencyWeight+b.autonomy*policy.autonomyWeight+(testsAvailable?b.tests*policy.testsWeight:0)+(safetyAvailable?b.safety*policy.safetyWeight:0);
  const score=Math.round(availableWeight>0?weightedScore/availableWeight:0);
  const evidenceCoverage:EvidenceCoverage={tests:testsAvailable,safety:safetyAvailable,availableWeight,provisional:missing.length>0,missing};

  const grade=score>=90?"A":score>=80?"B":score>=70?"C":score>=60?"D":"F";
  const dimensions: Array<{key:ScoreDimensionExplanation["key"];label:string;score:number;weight:number;available:boolean;reason:string}> = [
    {key:"outcome",label:"Outcome",score:b.outcome,weight:policy.outcomeWeight,available:true,reason:"Available from the workflow conclusion."},
    {key:"tests",label:"Tests",score:b.tests,weight:policy.testsWeight,available:testsAvailable,reason:testsAvailable?"Parsed test-suite evidence is attached.":"No parsed test report; this dimension is excluded, not treated as a pass or failure."},
    {key:"efficiency",label:"Efficiency",score:b.efficiency,weight:policy.efficiencyWeight,available:true,reason:"Estimated from execution duration and available cost data."},
    {key:"autonomy",label:"Autonomy",score:b.autonomy,weight:policy.autonomyWeight,available:true,reason:"Estimated from recorded human-intervention data."},
    {key:"safety",label:"Safety",score:b.safety,weight:policy.safetyWeight,available:safetyAvailable,reason:safetyAvailable?"Code-diff evidence is attached; review signals still require human interpretation.":"No code diff; safety is unassessed, not assumed safe."},
  ];
  const scoreExplanation: ScoreDimensionExplanation[] = dimensions.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    score: dimension.available ? dimension.score : null,
    baseWeight: Math.round(dimension.weight * 100),
    appliedWeight: dimension.available && availableWeight > 0 ? Number((dimension.weight / availableWeight * 100).toFixed(2)) : 0,
    contribution: dimension.available && availableWeight > 0 ? Number((dimension.score * dimension.weight / availableWeight).toFixed(2)) : 0,
    available: dimension.available,
    reason: dimension.reason,
  }));
  const recommendations=[...base.recommendations];
  if(!testsAvailable) recommendations.unshift("Test score is provisional: attach a parsed test report before treating this run as verified.");
  if(!safetyAvailable) recommendations.unshift("Safety score is provisional: collect code-diff evidence before treating this run as safe.");
  return {evaluation:{...base,score,grade,recommendations},policy,riskSignals:extractRiskSignals(bundle),evidenceIds:bundle.evidence.map(e=>e.id),evidenceCoverage,scoreStatus:evidenceCoverage.provisional?"provisional":"verified",scoreExplanation};
}
