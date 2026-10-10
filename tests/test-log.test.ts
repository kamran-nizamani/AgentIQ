import { describe, expect, it } from "vitest";
import { parseTestLogSummary } from "../src/test-log.js";

describe("test log summary parsing", () => {
  it("parses Vitest pass/fail/skip summaries", () => {
    expect(parseTestLogSummary(" ✓ src/a.test.ts (2 tests)\n Tests  1 failed | 8 passed | 1 skipped (10)")).toEqual({
      framework: "vitest", total: 10, passed: 8, failed: 1, skipped: 1,
    });
  });

  it("parses Jest totals", () => {
    expect(parseTestLogSummary("Tests:       2 failed, 9 passed, 1 skipped, 12 total")).toEqual({
      framework: "jest", total: 12, passed: 9, failed: 2, skipped: 1,
    });
  });

  it("parses pytest summaries and duration", () => {
    expect(parseTestLogSummary("===== 3 failed, 12 passed, 2 skipped in 1.24s =====")).toEqual({
      framework: "pytest", total: 17, passed: 12, failed: 3, skipped: 2, durationMs: 1240,
    });
  });

  it("does not invent counts when no supported summary exists", () => {
    expect(parseTestLogSummary("Run tests\nAll steps completed.")).toBeNull();
  });
});
