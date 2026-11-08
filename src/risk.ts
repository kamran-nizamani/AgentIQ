import type { EvidenceBundle } from "./evidence.js";

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export interface RiskSignal { id:string; severity:RiskSeverity; category:"change-size"|"test-regression"|"rollback"|"review"|"ci"|"sensitive-file"|"dependency-change"|"auth-change"|"authorization-change"|"secrets-config"|"migration"|"infrastructure"|"generated-files"|"untested-change"; message:string; evidenceIds:string[]; }

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
      const paths = (value: unknown): string[] => Array.isArray(value) ? value.filter((path): path is string => typeof path === "string") : [];
      const pathSignals: Array<{ key: string; category: RiskSignal["category"]; severity: RiskSeverity; label: string }> = [
        { key: "authFiles", category: "auth-change", severity: "high", label: "Authentication code changed" },
        { key: "authorizationFiles", category: "authorization-change", severity: "high", label: "Authorization or permission code changed" },
        { key: "secretsConfigFiles", category: "secrets-config", severity: "high", label: "Secrets or credential configuration changed" },
        { key: "migrationFiles", category: "migration", severity: "medium", label: "Database migration changed" },
        { key: "infrastructureFiles", category: "infrastructure", severity: "medium", label: "Infrastructure or deployment configuration changed" },
      ];
      for (const item of pathSignals) {
        const changed = paths(d[item.key]);
        if (changed.length) out.push({ id: e.id + ":" + item.category, severity: item.severity, category: item.category, message: item.label + ": " + changed.slice(0, 5).join(", ") + (changed.length > 5 ? ` (+${changed.length - 5} more)` : ""), evidenceIds: [e.id] });
      }
      const generated = paths(d.generatedFiles).filter((path) => !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|cargo\.lock|go\.sum)$/i.test(path));
      if (generated.length) out.push({ id: e.id + ":generated", severity: "low", category: "generated-files", message: generated.length + " generated or build-output file(s) changed; review the source instead.", evidenceIds: [e.id] });
      if (d.untestedSourceChange === true && added + deleted >= 50) {
        out.push({ id: e.id + ":untested", severity: "medium", category: "untested-change", message: "Production source changed without any test file changing.", evidenceIds: [e.id] });
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
