import { describe, expect, it } from "vitest";
import { scoreRemediationPriority } from "./remediation-priority.js";

describe("scoreRemediationPriority", () => {
  it("ranks evidenced critical security findings at the top", () => {
    expect(scoreRemediationPriority({ severity: "critical", category: "security", evidenceAvailable: true })).toMatchObject({ score: 100, label: "Critical" });
  });

  it("prioritizes high-severity CI failures with evidence", () => {
    expect(scoreRemediationPriority({ severity: "high", category: "ci", evidenceAvailable: true })).toMatchObject({ score: 92, label: "Critical" });
  });

  it("does not reward missing evidence", () => {
    const withEvidence = scoreRemediationPriority({ severity: "medium", category: "review", evidenceAvailable: true });
    const withoutEvidence = scoreRemediationPriority({ severity: "medium", category: "review", evidenceAvailable: false });
    expect(withEvidence.score).toBeGreaterThan(withoutEvidence.score);
    expect(withoutEvidence.reasons.join(" ")).toContain("Evidence link missing");
  });

  it("keeps scores within the documented 0–100 range", () => {
    expect(scoreRemediationPriority({ severity: "unknown", category: "maintenance", evidenceAvailable: false }).score).toBeGreaterThanOrEqual(0);
    expect(scoreRemediationPriority({ severity: "critical", category: "security", evidenceAvailable: true }).score).toBeLessThanOrEqual(100);
  });
});
