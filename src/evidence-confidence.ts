import type { Evidence, EvidenceBundle, EvidenceKind } from "./evidence.js";

/**
 * How much weight a piece of evidence deserves, as a deterministic 0..1 value
 * with the reasons that moved it. Confidence describes the *evidence*, not the
 * agent: a clean run backed by weak evidence is still weakly supported.
 *
 * It is advisory. It never changes a score on its own; callers decide how to
 * use it (for example to flag a "verified" score resting on low-confidence data).
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EvidenceConfidence {
  evidenceId: string;
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
}

const BASE_BY_SOURCE: Record<Evidence["provenance"]["source"], number> = {
  "github-actions": 0.9,
  github: 0.9,
  "test-report": 0.85,
  "git-diff": 0.85,
  "pull-request": 0.85,
  generic: 0.5,
};

/** Fields without which a given kind of evidence cannot support a conclusion. */
const REQUIRED_FIELDS: Partial<Record<EvidenceKind, string[]>> = {
  "workflow-run": ["conclusion"],
  "workflow-job": ["conclusion"],
  step: ["conclusion"],
  "test-suite": ["total", "passed", "failed"],
  coverage: ["linePct"],
  diff: ["filesChanged", "linesAdded", "linesDeleted"],
  "pull-request": ["state"],
  review: ["state"],
  commit: ["sha"],
  repository: ["defaultBranch"],
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function level(score: number): ConfidenceLevel {
  return score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";
}

export function scoreEvidenceConfidence(evidence: Evidence): EvidenceConfidence {
  const reasons: string[] = [];
  let score = BASE_BY_SOURCE[evidence.provenance.source] ?? 0.5;
  reasons.push(`Source "${evidence.provenance.source}" starts at ${score}.`);

  if (!evidence.provenance.sourceId) { score -= 0.3; reasons.push("Missing source identifier: cannot be traced back (-0.3)."); }
  if (!Number.isFinite(Date.parse(evidence.timestamp))) { score -= 0.2; reasons.push("Timestamp is missing or not a valid date (-0.2)."); }

  const missing = (REQUIRED_FIELDS[evidence.kind] ?? []).filter((field) => {
    const value = evidence.data[field];
    return value === undefined || value === null;
  });
  if (missing.length) {
    score -= Math.min(0.4, 0.15 * missing.length);
    reasons.push(`Missing field(s) for ${evidence.kind}: ${missing.join(", ")} (-${Math.min(0.4, 0.15 * missing.length).toFixed(2)}).`);
  }

  if (evidence.data.durationApproximate === true) { score -= 0.05; reasons.push("Duration is approximated from run timestamps (-0.05)."); }
  if (evidence.data.fileListTruncated === true) { score -= 0.15; reasons.push("File list was truncated by the API; the analysis is partial (-0.15)."); }
  if (evidence.kind === "test-suite" && typeof evidence.data.total === "number" && evidence.data.total === 0) {
    score -= 0.3; reasons.push("Test suite reports zero tests (-0.3).");
  }

  if (reasons.length === 1) reasons.push("Provenance and required fields are complete.");
  const finalScore = round2(clamp(score));
  return { evidenceId: evidence.id, score: finalScore, level: level(finalScore), reasons };
}

export interface BundleConfidence {
  score: number | null;
  level: ConfidenceLevel | null;
  lowConfidenceIds: string[];
  items: EvidenceConfidence[];
}

export function scoreBundleConfidence(bundle: EvidenceBundle): BundleConfidence {
  const items = bundle.evidence.map(scoreEvidenceConfidence);
  if (!items.length) return { score: null, level: null, lowConfidenceIds: [], items };
  // The weakest link bounds trust in a conclusion, so blend the mean with the minimum.
  const mean = items.reduce((sum, item) => sum + item.score, 0) / items.length;
  const minimum = Math.min(...items.map((item) => item.score));
  const score = round2(0.5 * mean + 0.5 * minimum);
  return {
    score,
    level: level(score),
    lowConfidenceIds: items.filter((item) => item.level === "low").map((item) => item.evidenceId),
    items,
  };
}
