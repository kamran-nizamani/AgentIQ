import { describe, expect, it } from "vitest";
import { parseTestReport } from "../src/test-report-parser.js";

describe("parseTestReport", () => {
  it("parses JUnit XML testcase outcomes and durations", () => {
    const xml = `<?xml version="1.0"?>
      <testsuites><testsuite name="unit" tests="3">
        <testcase name="ok" time="0.01"/>
        <testcase name="broken" time="0.20"><failure message="expected true"/></testcase>
        <testcase name="later"><skipped/></testcase>
      </testsuite></testsuites>`;
    expect(parseTestReport(xml)).toMatchObject({
      format: "junit-xml", framework: "junit", total: 3, passed: 1,
      failed: 1, skipped: 1, durationMs: 210, warnings: [],
    });
  });

  it("falls back to suite counters when XML contains no testcase elements", () => {
    expect(parseTestReport('<testsuites><testsuite tests="8" failures="2" errors="1" skipped="1" time="2.5"/></testsuites>'))
      .toMatchObject({ total: 8, passed: 4, failed: 3, skipped: 1, durationMs: 2500 });
  });

  it("parses Jest JSON counts and duration", () => {
    expect(parseTestReport(JSON.stringify({
      numTotalTests: 12, numPassedTests: 10, numFailedTests: 1, numPendingTests: 1,
      startTime: 1000, endTime: 2500,
    }), "jest-json")).toMatchObject({
      format: "jest-json", framework: "jest", total: 12, passed: 10,
      failed: 1, skipped: 1, durationMs: 1500,
    });
  });

  it("parses Vitest JSON using the shared Jest-compatible schema", () => {
    expect(parseTestReport('{"numTotalTests":4,"numPassedTests":4,"numFailedTests":0}', "vitest-json"))
      .toMatchObject({ framework: "vitest", total: 4, passed: 4, failed: 0, skipped: 0, durationMs: null });
  });

  it("parses pytest-json-report counts and seconds", () => {
    expect(parseTestReport(JSON.stringify({
      summary: { total: 7, passed: 4, failed: 1, error: 1, skipped: 1, xfailed: 0 },
      duration: 1.234,
    }), "pytest-json")).toMatchObject({
      format: "pytest-json", framework: "pytest", total: 7, passed: 4,
      failed: 2, skipped: 1, durationMs: 1234,
    });
  });

  it("reports unclassified tests without inventing outcomes", () => {
    expect(parseTestReport('{"numTotalTests":5,"numPassedTests":3,"numFailedTests":1}', "jest-json").warnings)
      .toContain("Some tests have an unclassified status.");
  });

  it("rejects malformed JSON and unsupported XML", () => {
    expect(() => parseTestReport("{", "jest-json")).toThrow("not valid JSON");
    expect(() => parseTestReport("<root/>", "junit-xml")).toThrow("does not look like JUnit XML");
  });

  it("rejects inconsistent test counts", () => {
    expect(() => parseTestReport('{"numTotalTests":2,"numPassedTests":2,"numFailedTests":1}', "jest-json"))
      .toThrow("counts are inconsistent");
  });

  it("rejects invalid pytest summary", () => {
    expect(() => parseTestReport('{"summary":{"total":4,"passed":-1}}', "pytest-json"))
      .toThrow("requires valid total and passed counts");
  });

  it("enforces a 5 MiB input limit", () => {
    expect(() => parseTestReport("x".repeat(5 * 1024 * 1024 + 1), "junit-xml"))
      .toThrow("5 MiB size limit");
  });
});
