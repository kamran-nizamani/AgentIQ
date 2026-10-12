export type PriorityInput = {
  severity: string;
  category: "ci" | "security" | "review" | "maintenance";
  evidenceAvailable: boolean;
};

export type RemediationPriority = {
  score: number;
  label: "Critical" | "High" | "Medium" | "Low";
  reasons: string[];
};

/** Deterministic triage score, not a probability or a security certification. */
export function scoreRemediationPriority(input: PriorityInput): RemediationPriority {
  const severity = input.severity.trim().toLowerCase();
  const base = severity === "critical" ? 95
    : severity === "high" || severity === "failure" ? 82
    : severity === "medium" || severity === "moderate" ? 62
    : severity === "low" ? 38
    : severity === "info" || severity === "success" || severity === "neutral" ? 20
    : 35;
  const reasons = ["Reported severity: " + (severity || "unknown")];
  let score = base;

  if (input.category === "security") {
    score += 8;
    reasons.push("Security advisory impact");
  } else if (input.category === "ci") {
    score += 5;
    reasons.push("Build or test pipeline impact");
  }
  if (input.evidenceAvailable) {
    score += 5;
    reasons.push("Source evidence link available");
  } else {
    reasons.push("Evidence link missing; verify before acting");
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 90 ? "Critical" : score >= 75 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, label, reasons };
}
