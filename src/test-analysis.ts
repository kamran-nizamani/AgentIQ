import type { Evidence } from "./evidence.js";
import { EVIDENCE_SCHEMA_VERSION } from "./evidence-schema.js";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type CoverageFormat = "lcov" | "istanbul-summary-json" | "cobertura-xml";

export interface CoverageMetric { total: number; covered: number; pct: number | null; }
export interface ParsedCoverage {
  format: CoverageFormat;
  lines: CoverageMetric;
  branches: CoverageMetric | null;
  functions: CoverageMetric | null;
  warnings: string[];
}

const metric = (total: number, covered: number): CoverageMetric => ({
  total,
  covered,
  pct: total > 0 ? Math.round((covered / total) * 10000) / 100 : null,
});

function checkedCount(value: unknown, field: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new Error(`Coverage report has an invalid ${field}.`);
  return n;
}

function parseLcov(text: string): ParsedCoverage {
  const sums = { LF: 0, LH: 0, BRF: 0, BRH: 0, FNF: 0, FNH: 0 };
  let records = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "end_of_record") { records += 1; continue; }
    const match = /^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/.exec(line);
    if (match) sums[match[1] as keyof typeof sums] += Number(match[2]);
  }
  if (records === 0) throw new Error("LCOV report contains no records.");
  if (sums.LH > sums.LF) throw new Error("LCOV report is inconsistent: hit lines exceed found lines.");
  const warnings: string[] = [];
  if (sums.BRF === 0) warnings.push("No branch data in the LCOV report.");
  return {
    format: "lcov",
    lines: metric(sums.LF, sums.LH),
    branches: sums.BRF > 0 ? metric(sums.BRF, sums.BRH) : null,
    functions: sums.FNF > 0 ? metric(sums.FNF, sums.FNH) : null,
    warnings,
  };
}

function parseIstanbulSummary(text: string): ParsedCoverage {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("Coverage summary is not valid JSON."); }
  const total = (json as { total?: Record<string, { total?: unknown; covered?: unknown }> } | null)?.total;
  if (!total || typeof total !== "object" || !total.lines) throw new Error("Coverage summary has no total.lines section.");
  const read = (key: string): CoverageMetric | null => {
    const section = total[key];
    if (!section) return null;
    return metric(checkedCount(section.total, `${key}.total`), checkedCount(section.covered, `${key}.covered`));
  };
  const lines = read("lines")!;
  if (lines.covered > lines.total) throw new Error("Coverage summary is inconsistent: covered lines exceed total.");
  return { format: "istanbul-summary-json", lines, branches: read("branches"), functions: read("functions"), warnings: [] };
}

function parseCobertura(text: string): ParsedCoverage {
  const root = /<coverage\b([^>]*)>/i.exec(text);
  if (!root) throw new Error("Cobertura report has no <coverage> element.");
  const attr = (name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`, "i").exec(root[1]!)?.[1];
  const warnings: string[] = [];
  const valid = attr("lines-valid");
  const covered = attr("lines-covered");
  if (valid === undefined || covered === undefined) throw new Error("Cobertura report lacks lines-valid/lines-covered attributes.");
  const lines = metric(checkedCount(valid, "lines-valid"), checkedCount(covered, "lines-covered"));
  if (lines.covered > lines.total) throw new Error("Cobertura report is inconsistent: covered lines exceed valid lines.");
  const bValid = attr("branches-valid");
  const bCovered = attr("branches-covered");
  let branches: CoverageMetric | null = null;
  if (bValid !== undefined && bCovered !== undefined && Number(bValid) > 0) {
    branches = metric(checkedCount(bValid, "branches-valid"), checkedCount(bCovered, "branches-covered"));
  } else warnings.push("No branch data in the Cobertura report.");
  return { format: "cobertura-xml", lines, branches, functions: null, warnings };
}

export function parseCoverageReport(text: string, format: CoverageFormat): ParsedCoverage {
  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) throw new Error("Coverage report exceeds the 5 MiB limit.");
  if (format === "lcov") return parseLcov(text);
  if (format === "istanbul-summary-json") return parseIstanbulSummary(text);
  if (format === "cobertura-xml") return parseCobertura(text);
  throw new Error(`Unsupported coverage format: ${String(format)}`);
}

export interface CoverageEvidenceInput {
  report: ParsedCoverage;
  repository: string;
  commitSha: string;
  workflowRunId: string | number;
  sourceId: string;
}

export function ingestCoverageEvidence(input: CoverageEvidenceInput): Evidence {
  const now = new Date().toISOString();
  const { report } = input;
  return {
    id: "coverage:" + input.sourceId,
    kind: "coverage",
    timestamp: now,
    provenance: { source: "test-report", sourceId: input.sourceId, collectedAt: now, schemaVersion: EVIDENCE_SCHEMA_VERSION },
    data: {
      format: report.format,
      repository: input.repository,
      commitSha: input.commitSha,
      workflowRunId: String(input.workflowRunId),
      linePct: report.lines.pct,
      linesTotal: report.lines.total,
      linesCovered: report.lines.covered,
      branchPct: report.branches?.pct ?? null,
      functionPct: report.functions?.pct ?? null,
      warnings: report.warnings,
    },
  };
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

export type FailureClass =
  | "assertion"
  | "timeout"
  | "environment"
  | "dependency"
  | "compilation"
  | "flaky-suspected"
  | "unknown";

export interface FailureClassification { failureClass: FailureClass; rule: string | null; }

/** Ordered: the first matching rule wins, so the specific causes come before the generic assertion. */
const RULES: Array<{ failureClass: FailureClass; rule: string; pattern: RegExp }> = [
  { failureClass: "compilation", rule: "compile-error", pattern: /\b(syntaxerror|SyntaxError|TS\d{4}|cannot find (name|module)|compilation (failed|error)|error TS\d+|parse error|unexpected token)\b/i },
  { failureClass: "dependency", rule: "missing-dependency", pattern: /\b(ModuleNotFoundError|ImportError|ERR_MODULE_NOT_FOUND|cannot resolve (dependency|module)|no matching distribution|could not resolve dependency|npm ERR!|package .* not found|ETARGET)\b/i },
  { failureClass: "timeout", rule: "timeout", pattern: /\b(timed? ?out|timeout|exceeded .*time ?limit|deadline exceeded|ETIMEDOUT)\b/i },
  { failureClass: "environment", rule: "environment", pattern: /\b(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|connection (refused|reset)|out of memory|ENOMEM|ENOSPC|no space left|permission denied|EACCES|rate limit|service unavailable|502 bad gateway)\b/i },
  { failureClass: "flaky-suspected", rule: "flaky-marker", pattern: /\b(flaky|intermittent|race condition|non-?deterministic)\b/i },
  { failureClass: "assertion", rule: "assertion", pattern: /\b(AssertionError|assertion (failed|error)|expected .* (to|but)|expect\(|toBe|toEqual|toMatch|assert\b|not equal|received:)/i },
];

export function classifyFailure(message: string | null | undefined, type?: string | null): FailureClassification {
  const text = `${type ?? ""}\n${message ?? ""}`;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return { failureClass: rule.failureClass, rule: rule.rule };
  }
  return { failureClass: "unknown", rule: null };
}

export interface TestFailure { name: string; className?: string | null; message: string; type?: string | null; }

/** Pull failed/errored testcases out of a JUnit XML document. Aggregate-safe: malformed input yields an empty list. */
export function extractJUnitFailures(xml: string): TestFailure[] {
  if (Buffer.byteLength(xml, "utf8") > MAX_INPUT_BYTES) throw new Error("Test report exceeds the 5 MiB limit.");
  const failures: TestFailure[] = [];
  const decode = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const attr = (tag: string, name: string): string | null => {
    const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
    return match ? decode(match[1]!) : null;
  };
  const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let match: RegExpExecArray | null;
  while ((match = caseRe.exec(xml)) !== null) {
    const body = match[2] ?? "";
    const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    if (!failure) continue;
    const message = attr(failure[2] ?? "", "message") ?? decode((failure[3] ?? "").trim()).slice(0, 500);
    failures.push({
      name: attr(match[1]!, "name") ?? "(unnamed)",
      className: attr(match[1]!, "classname"),
      message,
      type: attr(failure[2] ?? "", "type"),
    });
  }
  return failures;
}

export function summarizeFailures(failures: TestFailure[]): Record<FailureClass, number> {
  const counts: Record<FailureClass, number> = {
    assertion: 0, timeout: 0, environment: 0, dependency: 0, compilation: 0, "flaky-suspected": 0, unknown: 0,
  };
  for (const failure of failures) counts[classifyFailure(failure.message, failure.type).failureClass] += 1;
  return counts;
}
