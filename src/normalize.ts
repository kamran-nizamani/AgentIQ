import type { AgentRun } from "./types.js";
import type { EvidenceBundle } from "./evidence.js";

const asNumber=(value:unknown,fallback=0)=>typeof value==="number"&&Number.isFinite(value)?value:fallback;
const dataOf=(value:unknown)=>value&&typeof value==="object"?value as Record<string,unknown>:{};

export function evidenceBundleToAgentRun(bundle:EvidenceBundle):AgentRun {
  const workflow=bundle.evidence.find(e=>e.kind==="workflow-run");
  const tests=bundle.evidence.filter(e=>e.kind==="test-suite").map(e=>dataOf(e.data));
  const diffs=bundle.evidence.filter(e=>e.kind==="diff").map(e=>dataOf(e.data));
  if(!workflow) throw new Error("Cannot create AgentRun: workflow-run evidence is missing.");

  const wd=dataOf(workflow.data);
  const conclusion=String(wd.conclusion??"");
  const taskOutcome=conclusion==="success"?"success":conclusion==="failure"?"failure":"partial";
  const total=tests.reduce((n,t)=>n+asNumber(t.total),0);
  const passed=tests.reduce((n,t)=>n+asNumber(t.passed),0);
  const failed=tests.reduce((n,t)=>n+asNumber(t.failed),0);
  const filesChanged=diffs.reduce((n,d)=>n+asNumber(d.filesChanged),0);
  const linesAdded=diffs.reduce((n,d)=>n+asNumber(d.linesAdded),0);
  const linesDeleted=diffs.reduce((n,d)=>n+asNumber(d.linesDeleted),0);

  const start=String(wd.startedAt??workflow.timestamp);
  const end=String(wd.completedAt??workflow.timestamp);
  const durationMs=Math.max(0,Date.parse(end)-Date.parse(start));

  return {
    id:workflow.provenance.sourceId,
    taskOutcome,
    tests:{total,passed,failed},
    changes:{filesChanged,linesAdded,linesDeleted},
    execution:{durationMs},
    humanIntervention:{required:false,interventions:0},
    rollback:false
  };
}
