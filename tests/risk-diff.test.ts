import { describe, expect, it } from "vitest";
import { extractRiskSignals } from "../src/risk.js";
import type { EvidenceBundle } from "../src/evidence.js";

describe("diff risk evidence", () => {
  it("flags secret paths and dependency changes from real diff evidence", () => {
    const bundle: EvidenceBundle = {
      schemaVersion: "1.0",
      evidence: [{
        id: "git-diff:fixture",
        kind: "diff",
        timestamp: "2026-10-10T00:00:00.000Z",
        provenance: { source: "git-diff", sourceId: "fixture", collectedAt: "2026-10-10T00:00:00.000Z", schemaVersion: "1.0" },
        data: {
          filesChanged: 2,
          linesAdded: 10,
          linesDeleted: 2,
          sensitiveFiles: [{ path: ".env.production", severity: "critical" }],
          dependencyFiles: ["package-lock.json"],
        },
      }],
    };
    const signals = extractRiskSignals(bundle);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "sensitive-file", severity: "critical" }),
      expect.objectContaining({ category: "dependency-change", severity: "medium" }),
    ]));
  });

  it("does not flag ordinary small diffs without sensitive or dependency evidence", () => {
    const bundle: EvidenceBundle = {
      schemaVersion: "1.0",
      evidence: [{
        id: "git-diff:small",
        kind: "diff",
        timestamp: "2026-10-10T00:00:00.000Z",
        provenance: { source: "git-diff", sourceId: "small", collectedAt: "2026-10-10T00:00:00.000Z", schemaVersion: "1.0" },
        data: { filesChanged: 1, linesAdded: 5, linesDeleted: 1 },
      }],
    };
    expect(extractRiskSignals(bundle)).toEqual([]);
  });
});
