import { describe, expect, it } from "vitest";
import { assessedCount, bandOf, buildSegments, describeSegments, DIMENSIONS } from "./evidence-bar";

describe("evidence bar", () => {
  it("uses the scoring policy weights, which sum to 100", () => {
    expect(DIMENSIONS.map((dimension) => dimension.weight)).toEqual([35, 30, 15, 10, 10]);
    expect(DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(100);
  });

  it("bands scores at 80 and 60", () => {
    expect([100, 80, 79.9, 60, 59.9, 0].map(bandOf)).toEqual(["good", "good", "mid", "mid", "bad", "bad"]);
  });

  it("shows missing evidence as unassessed, never as zero or pass", () => {
    const segments = buildSegments({ outcome: 90, tests: null, efficiency: 70, autonomy: 50, safety: undefined });
    expect(segments.map((segment) => segment.score)).toEqual([90, null, 70, 50, null]);
    expect(segments.map((segment) => segment.band)).toEqual(["good", null, "mid", "bad", null]);
    expect(assessedCount(segments)).toBe(3);
  });

  it("clamps out-of-range scores and treats non-finite values as missing", () => {
    const segments = buildSegments({ outcome: 140, tests: -5, efficiency: Number.NaN });
    expect(segments[0]!.score).toBe(100);
    expect(segments[1]!.score).toBe(0);
    expect(segments[2]!.score).toBeNull();
  });

  it("describes the bar in words for assistive technology", () => {
    expect(describeSegments(buildSegments({ outcome: 90.4, tests: null }))).toBe(
      "Outcome 90, Tests not assessed, Efficiency not assessed, Autonomy not assessed, Safety not assessed",
    );
  });
});
