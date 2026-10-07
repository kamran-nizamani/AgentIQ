import type { Evidence, EvidenceBundle } from "./evidence.js";
export const EVIDENCE_SCHEMA_VERSION = "1.0";
export function isEvidence(value: unknown): value is Evidence {
  if (!value || typeof value !== "object") return false;
  const c=value as Record<string,unknown>;
  return typeof c.id==="string" && typeof c.kind==="string" && typeof c.timestamp==="string" &&
    typeof c.provenance==="object" && c.provenance!==null && typeof c.data==="object" && c.data!==null;
}
export function validateEvidenceBundle(value: unknown): value is EvidenceBundle {
  if (!value || typeof value !== "object") return false;
  const c=value as Record<string,unknown>;
  return c.schemaVersion===EVIDENCE_SCHEMA_VERSION && Array.isArray(c.evidence) && c.evidence.every(isEvidence);
}