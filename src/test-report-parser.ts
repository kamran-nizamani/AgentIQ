export type TestReportFormat = "junit-xml" | "jest-json" | "vitest-json" | "pytest-json";

export interface ParsedTestReport {
  format: TestReportFormat;
  framework: "junit" | "jest" | "vitest" | "pytest";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
  warnings: string[];
}

const MAX_REPORT_BYTES = 5 * 1024 * 1024;

function asCount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function secondsToMs(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

function normalizeCounts(total: number, passed: number, failed: number, skipped: number, warnings: string[]): {
  total: number; passed: number; failed: number; skipped: number;
} {
  if (![total, passed, failed, skipped].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error("Test report contains invalid or negative test counts.");
  }
  if (passed + failed + skipped > total) {
    throw new Error("Test report counts are inconsistent: passed + failed + skipped exceeds total.");
  }
  if (passed + failed + skipped < total) warnings.push("Some tests have an unclassified status.");
  return { total, passed, failed, skipped };
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const body = tag.replace(/^<[^\s/>]+|\/?\s*>$/g, "");
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of body.matchAll(pattern)) result[match[1]] = match[2] ?? match[3] ?? "";
  return result;
}

function parseJUnit(xml: string): ParsedTestReport {
  if (!/<(?:testsuite|testsuites)\b/i.test(xml)) throw new Error("Input does not look like JUnit XML.");
  const warnings: string[] = [];
  const cases = [...xml.matchAll(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase\s*>/gi)];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;
  let hasDuration = false;

  for (const item of cases) {
    const testcase = item[0];
    const opening = testcase.match(/^<testcase\b[^>]*>/i)?.[0] ?? testcase;
    const attrs = attributes(opening);
    if (/<(?:failure|error)\b/i.test(testcase)) failed += 1;
    else if (/<(?:skipped|disabled)\b/i.test(testcase)) skipped += 1;
    else passed += 1;
    const duration = secondsToMs(attrs.time);
    if (duration !== null) { durationMs += duration; hasDuration = true; }
  }

  if (cases.length > 0) {
    return {
      format: "junit-xml", framework: "junit",
      ...normalizeCounts(cases.length, passed, failed, skipped, warnings),
      durationMs: hasDuration ? durationMs : null, warnings,
    };
  }

  // Some CI reports emit only suite-level counters. Sum suite records when present.
  const suites = [...xml.matchAll(/<testsuite\b[^>]*\/?\s*>/gi)].map((item) => attributes(item[0]));
  if (!suites.length) throw new Error("JUnit XML contains no test cases or suite summaries.");
  const sum = (key: string): number => suites.reduce((value, suite) => value + (asCount(suite[key]) ?? 0), 0);
  const total = sum("tests");
  const suitePassed = sum("passed");
  const suiteFailures = sum("failures") + sum("errors");
  const suiteSkipped = sum("skipped");
  const inferredPassed = suites.some((suite) => asCount(suite.passed) !== null)
    ? suitePassed
    : Math.max(0, total - suiteFailures - suiteSkipped);
  const suiteDuration = suites.reduce((value, suite) => value + (secondsToMs(suite.time) ?? 0), 0);
  const hasSuiteDuration = suites.some((suite) => secondsToMs(suite.time) !== null);
  return {
    format: "junit-xml", framework: "junit",
    ...normalizeCounts(total, inferredPassed, suiteFailures, suiteSkipped, warnings),
    durationMs: hasSuiteDuration ? suiteDuration : null, warnings,
  };
}

function parseJson(content: string): unknown {
  try { return JSON.parse(content) as unknown; }
  catch { throw new Error("Test report is not valid JSON."); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJestJson(content: string, framework: "jest" | "vitest"): ParsedTestReport {
  const root = record(parseJson(content));
  if (!root) throw new Error("Test report JSON must be an object.");
  const total = asCount(root.numTotalTests);
  const passed = asCount(root.numPassedTests);
  const failed = asCount(root.numFailedTests);
  const skipped = asCount(root.numPendingTests) ?? asCount(root.numTodoTests) ?? 0;
  if (total === null || passed === null || failed === null) {
    throw new Error("Jest/Vitest JSON requires numTotalTests, numPassedTests, and numFailedTests.");
  }
  const warnings: string[] = [];
  const counts = normalizeCounts(total, passed, failed, skipped, warnings);
  const start = asCount(root.startTime);
  const end = asCount(root.endTime);
  const durationMs = start !== null && end !== null && end >= start ? end - start : null;
  return {
    format: framework === "jest" ? "jest-json" : "vitest-json",
    framework, ...counts, durationMs, warnings,
  };
}

function parsePytestJson(content: string): ParsedTestReport {
  const root = record(parseJson(content));
  const summary = record(root?.summary);
  if (!root || !summary) throw new Error("Pytest JSON requires a summary object (pytest-json-report format).");
  const total = asCount(summary.total);
  const failed = (asCount(summary.failed) ?? 0) + (asCount(summary.error) ?? 0);
  const skipped = (asCount(summary.skipped) ?? 0) + (asCount(summary.xfailed) ?? 0);
  const passed = asCount(summary.passed);
  if (total === null || passed === null) throw new Error("Pytest summary requires valid total and passed counts.");
  const warnings: string[] = [];
  return {
    format: "pytest-json", framework: "pytest",
    ...normalizeCounts(total, passed, failed, skipped, warnings),
    durationMs: secondsToMs(root.duration), warnings,
  };
}

/**
 * Parse bounded JUnit XML, Jest/Vitest JSON, or pytest-json-report output.
 * The parser extracts aggregate facts only; it never executes report contents.
 */
export function parseTestReport(content: string, format?: TestReportFormat): ParsedTestReport {
  if (typeof content !== "string" || content.length === 0) throw new Error("Test report content is required.");
  if (content.length > MAX_REPORT_BYTES) throw new Error("Test report exceeds the 5 MiB size limit.");
  const selected = format ?? (content.trimStart().startsWith("<") ? "junit-xml" : "jest-json");
  switch (selected) {
    case "junit-xml": return parseJUnit(content);
    case "jest-json": return parseJestJson(content, "jest");
    case "vitest-json": return parseJestJson(content, "vitest");
    case "pytest-json": return parsePytestJson(content);
    default: {
      const exhaustive: never = selected;
      throw new Error("Unsupported test report format: " + exhaustive);
    }
  }
}
