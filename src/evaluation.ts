import type { AgentEvaluation, AgentRun } from "./types.js";
import { evaluateAgentRun } from "./scoring.js";
import type { EvidenceBundle } from "./evidence.js";
import { extractRiskSignals, type RiskSignal } from "./risk.js";

export interface EvaluationPolicy { id:string; outcomeWeight:number; testsWeight:number; efficiencyWeight:number; autonomyWeight:number; safetyWeight:number; }
export const DEFAULT_POLICY: EvaluationPolicy={id:"default-engineering-v1",outcomeWeight:.35,testsWeight:.30,efficiencyWeight:.15,autonomyWeight:.10,safetyWeight:.10};

export interface EvaluationReport { evaluation:AgentEvaluation; policy:EvaluationPolicy; riskSignals:RiskSignal[]; evidenceIds:string[]; }

export function evaluateEvidence(bundle:EvidenceBundle, run:AgentRun, policy:EvaluationPolicy=DEFAULT_POLICY): EvaluationReport {
  const sum=policy.outcomeWeight+policy.testsWeight+policy.efficiencyWeight+policy.autonomyWeight+policy.safetyWeight;
  if(Math.abs(sum-1)>1e-9) throw new Error("Evaluation policy weights must sum to 1.");
  const base=evaluateAgentRun(run);
  const b=base.breakdown;
  const score=Math.round(b.outcome*policy.outcomeWeight+b.tests*policy.testsWeight+b.efficiency*policy.efficiencyWeight+b.autonomy*policy.autonomyWeight+b.safety*policy.safetyWeight);
  const grade=score>=90?"A":score>=80?"B":score>=70?"C":score>=60?"D":"F";
  return {evaluation:{...base,score,grade},policy,riskSignals:extractRiskSignals(bundle),evidenceIds:bundle.evidence.map(e=>e.id)};
}
