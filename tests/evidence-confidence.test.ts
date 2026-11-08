import { describe, expect, it } from "vitest";
import { scoreBundleConfidence, scoreEvidenceConfidence } from "../src/evidence-confidence.js";
import type { Evidence } from "../src/evidence.js";

const ev = (over: Partial<Evidence> & { data?: Record<string, unknown> }): Evidence => ({
  id: "e1", kind: "workflow-run", timestamp: "2026-10-08T00:00:00Z",
  provenance: { source: "github", sourceId: "42", collectedAt: "2026-10-08T00:00:00Z", schemaVersion: "1.0" },
  data: { conclusion: "success" }, ...over,
});

describe("evidence confidence", () => {
  it("rates complete first-party evidence high", () => {
    expect(scoreEvidenceConfidence(ev({}))).toMatchObject({ score: 0.9, level: "high" });
  });
  it("penalizes missing required fields, naming them", () => {
    const c = scoreEvidenceConfidence(ev({ data: {} }));
    expect(c.score).toBeLessThan(0.9);
    expect(c.reasons.join(" ")).toContain("conclusion");
  });
  it("penalizes untraceable, undated and generic evidence", () => {
    const c = scoreEvidenceConfidence(ev({ timestamp: "never", provenance: { source: "generic", sourceId: "", collectedAt: "x", schemaVersion: "1.0" } }));
    expect(c.level).toBe("low");
    expect(c.score).toBeGreaterThanOrEqual(0);
  });
  it("penalizes approximate durations, truncated file lists and empty test suites", () => {
    expect(scoreEvidenceConfidence(ev({ data: { conclusion: "success", durationApproximate: true } })).score).toBe(0.85);
    expect(scoreEvidenceConfidence(ev({ kind: "diff", data: { filesChanged: 1, linesAdded: 1, linesDeleted: 0, fileListTruncated: true } })).score).toBe(0.75);
    const empty = scoreEvidenceConfidence(ev({ kind: "test-suite", data: { total: 0, passed: 0, failed: 0 } }));
    expect(empty.reasons.join(" ")).toContain("zero tests");
  });
  it("bounds a bundle by its weakest evidence", () => {
    const bundle = { schemaVersion: "1.0" as const, evidence: [ev({ id: "good" }), ev({ id: "bad", data: {}, provenance: { source: "generic", sourceId: "", collectedAt: "x", schemaVersion: "1.0" } })] };
    const r = scoreBundleConfidence(bundle);
    expect(r.lowConfidenceIds).toEqual(["bad"]);
    expect(r.score!).toBeLessThan(0.7);
    expect(scoreBundleConfidence({ schemaVersion: "1.0", evidence: [] })).toMatchObject({ score: null, level: null });
  });
});
