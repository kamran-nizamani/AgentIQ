import type { EvidenceBundle } from "./evidence.js";

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export interface RiskSignal { id:string; severity:RiskSeverity; category:"change-size"|"test-regression"|"rollback"|"review"|"ci"|"sensitive-file"|"dependency-change"; message:string; evidenceIds:string[]; }

const severity=(n:number):RiskSeverity=>n>=3?"critical":n===2?"high":n===1?"medium":"low";

export function extractRiskSignals(bundle: EvidenceBundle): RiskSignal[] {
  const out: RiskSignal[]=[];
  for(const e of bundle.evidence){
    const d=e.data;
    if(e.kind==="diff"){
      const added=typeof d.linesAdded==="number"?d.linesAdded:0;
      const deleted=typeof d.linesDeleted==="number"?d.linesDeleted:0;
      const files=typeof d.filesChanged==="number"?d.filesChanged:0;
      const level=added+deleted>1000||files>30?3:added+deleted>500||files>15?2:added+deleted>250||files>8?1:0;
      if(level) out.push({id:e.id+":size",severity:severity(level),category:"change-size",message:"Large change surface detected.",evidenceIds:[e.id]});
      const sensitive = Array.isArray(d.sensitiveFiles) ? d.sensitiveFiles as Array<{ path?: unknown; severity?: unknown }> : [];
      for (const file of sensitive) {
        const path = typeof file.path === "string" ? file.path : "Unknown path";
        const critical = file.severity === "critical";
        out.push({
          id: e.id + ":sensitive:" + path,
          severity: critical ? "critical" : "high",
          category: "sensitive-file",
          message: (critical ? "Potential secret or private-key path changed: " : "Security-sensitive path changed: ") + path,
          evidenceIds: [e.id],
        });
      }
      const dependencies = Array.isArray(d.dependencyFiles) ? d.dependencyFiles.filter((path): path is string => typeof path === "string") : [];
      if (dependencies.length) out.push({
        id: e.id + ":dependencies",
        severity: "medium",
        category: "dependency-change",
        message: "Dependency manifest or lockfile changed: " + dependencies.join(", "),
        evidenceIds: [e.id],
      });
    }
    if(e.kind==="test-suite"){
      const failed=typeof d.failed==="number"?d.failed:0;
      if(failed>0) out.push({id:e.id+":tests",severity:failed>=5?"high":"medium",category:"test-regression",message:`${failed} test(s) failed.`,evidenceIds:[e.id]});
    }
    if(e.kind==="pull-request" && d.reviewDecision==="changes_requested"){
      out.push({id:e.id+":review",severity:"medium",category:"review",message:"Pull request received requested changes.",evidenceIds:[e.id]});
    }
    if(e.kind==="workflow-run" && d.conclusion==="failure"){
      out.push({id:e.id+":ci",severity:"high",category:"ci",message:"CI workflow failed.",evidenceIds:[e.id]});
    }
  }
  return out;
}
