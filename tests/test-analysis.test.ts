import { describe, expect, it } from "vitest";
import { classifyFailure, extractJUnitFailures, ingestCoverageEvidence, parseCoverageReport, summarizeFailures } from "../src/test-analysis.js";

const LCOV = `TN:
SF:src/a.ts
FNF:2
FNH:1
LF:10
LH:8
BRF:4
BRH:2
end_of_record
SF:src/b.ts
LF:10
LH:10
end_of_record
`;

describe("coverage parsing", () => {
  it("parses and sums LCOV records", () => {
    const c = parseCoverageReport(LCOV, "lcov");
    expect(c.lines).toEqual({ total: 20, covered: 18, pct: 90 });
    expect(c.branches).toEqual({ total: 4, covered: 2, pct: 50 });
    expect(c.functions).toEqual({ total: 2, covered: 1, pct: 50 });
  });
  it("parses an Istanbul coverage-summary.json", () => {
    const c = parseCoverageReport(JSON.stringify({ total: { lines: { total: 200, covered: 150 }, branches: { total: 40, covered: 30 }, functions: { total: 20, covered: 20 } } }), "istanbul-summary-json");
    expect(c.lines.pct).toBe(75);
    expect(c.branches?.pct).toBe(75);
    expect(c.functions?.pct).toBe(100);
  });
  it("parses Cobertura root attributes", () => {
    const c = parseCoverageReport('<?xml version="1.0"?><coverage lines-valid="50" lines-covered="40" branches-valid="10" branches-covered="5" line-rate="0.8"></coverage>', "cobertura-xml");
    expect(c.lines.pct).toBe(80);
    expect(c.branches?.pct).toBe(50);
  });
  it("rejects empty, inconsistent, malformed and oversized input", () => {
    expect(() => parseCoverageReport("", "lcov")).toThrow(/no records/);
    expect(() => parseCoverageReport("LF:5\nLH:9\nend_of_record", "lcov")).toThrow(/inconsistent/);
    expect(() => parseCoverageReport("{", "istanbul-summary-json")).toThrow(/valid JSON/);
    expect(() => parseCoverageReport(JSON.stringify({ total: { lines: { total: 5, covered: 9 } } }), "istanbul-summary-json")).toThrow(/inconsistent/);
    expect(() => parseCoverageReport("<root/>", "cobertura-xml")).toThrow(/<coverage>/);
    expect(() => parseCoverageReport("x".repeat(5 * 1024 * 1024 + 1), "lcov")).toThrow(/5 MiB/);
  });
  it("reports zero-line coverage as unknown rather than 0% or 100%", () => {
    expect(parseCoverageReport("LF:0\nLH:0\nend_of_record", "lcov").lines.pct).toBeNull();
  });
  it("creates coverage evidence", () => {
    const e = ingestCoverageEvidence({ report: parseCoverageReport(LCOV, "lcov"), repository: "o/r", commitSha: "abc", workflowRunId: 5, sourceId: "o/r:5" });
    expect(e).toMatchObject({ kind: "coverage", data: { linePct: 90, branchPct: 50, commitSha: "abc", workflowRunId: "5" } });
  });
});

describe("failure classification", () => {
  it.each([
    ["AssertionError: expected 3 to equal 4", "assertion"],
    ["expected 503 to equal 200", "assertion"],
    ["Test timed out in 5000ms", "timeout"],
    ["connect ECONNREFUSED 127.0.0.1:5432", "environment"],
    ["ModuleNotFoundError: No module named 'requests'", "dependency"],
    ["error TS2304: Cannot find name 'foo'", "compilation"],
    ["intermittent failure, race condition in worker", "flaky-suspected"],
    ["something strange happened", "unknown"],
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyFailure(message).failureClass).toBe(expected);
  });
  it("returns the matched rule, and uses the failure type too", () => {
    expect(classifyFailure("boom", "AssertionError")).toEqual({ failureClass: "assertion", rule: "assertion" });
    expect(classifyFailure(null)).toEqual({ failureClass: "unknown", rule: null });
  });
  it("extracts failures from JUnit XML and summarizes them", () => {
    const xml = `<testsuite>
      <testcase classname="a" name="ok"/>
      <testcase classname="a" name="bad"><failure message="expected 1 to equal 2" type="AssertionError">trace</failure></testcase>
      <testcase classname="b" name="slow"><error message="Test timed out &amp; aborted">x</error></testcase>
    </testsuite>`;
    const failures = extractJUnitFailures(xml);
    expect(failures.map((f) => f.name)).toEqual(["bad", "slow"]);
    expect(failures[1]!.message).toBe("Test timed out & aborted");
    expect(summarizeFailures(failures)).toMatchObject({ assertion: 1, timeout: 1, unknown: 0 });
  });
  it("returns no failures for malformed input", () => {
    expect(extractJUnitFailures("not xml")).toEqual([]);
  });
});
