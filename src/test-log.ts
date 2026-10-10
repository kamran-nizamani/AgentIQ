export interface ParsedTestSummary {
  framework: "vitest" | "jest" | "pytest";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
}

function countMatches(line: string, expression: RegExp): number {
  const match = expression.exec(line);
  return match ? Number(match[1]) : 0;
}

function parseVitest(log: string): ParsedTestSummary | null {
  const lines = log.split(/\r?\n/).filter((line) => /^\s*Tests\s+/i.test(line) && /\b(?:passed|failed|skipped|todo)\b/i.test(line));
  const line = lines[lines.length - 1];
  if (!line) return null;
  const passed = countMatches(line, /(\d+)\s+passed\b/i);
  const failed = countMatches(line, /(\d+)\s+failed\b/i);
  const skipped = countMatches(line, /(\d+)\s+(?:skipped|todo)\b/i);
  const totalFromParens = countMatches(line, /\((\d+)\)/);
  const total = totalFromParens || passed + failed + skipped;
  if (!total || passed + failed + skipped > total) return null;
  return { framework: "vitest", total, passed, failed, skipped };
}

function parseJest(log: string): ParsedTestSummary | null {
  const lines = log.split(/\r?\n/).filter((line) => /^\s*Tests:\s*/i.test(line) && /\btotal\b/i.test(line));
  const line = lines[lines.length - 1];
  if (!line) return null;
  const passed = countMatches(line, /(\d+)\s+passed\b/i);
  const failed = countMatches(line, /(\d+)\s+failed\b/i);
  const skipped = countMatches(line, /(\d+)\s+(?:skipped|pending|todo)\b/i);
  const total = countMatches(line, /(\d+)\s+total\b/i);
  if (!total || passed + failed + skipped > total) return null;
  return { framework: "jest", total, passed, failed, skipped };
}

function parsePytest(log: string): ParsedTestSummary | null {
  const lines = log.split(/\r?\n/).filter((line) =>
    /\b(?:passed|failed|skipped|error[s]?)\b/i.test(line) && /\bin\s+[\d.]+s\b/i.test(line) &&
    (/={2,}/.test(line) || /\b(?:passed|failed|skipped|error[s]?)\b.*\bin\s+[\d.]+s\b/i.test(line))
  );
  const line = lines[lines.length - 1];
  if (!line) return null;
  const passed = countMatches(line, /(\d+)\s+passed\b/i);
  const failed = countMatches(line, /(\d+)\s+failed\b/i) + countMatches(line, /(\d+)\s+errors?\b/i);
  const skipped = countMatches(line, /(\d+)\s+skipped\b/i);
  const total = passed + failed + skipped;
  const seconds = countMatches(line, /in\s+([\d.]+)s\b/i);
  if (!total) return null;
  return { framework: "pytest", total, passed, failed, skipped, durationMs: seconds ? Math.round(seconds * 1000) : undefined };
}

/** Parse only explicit, conventional test-run summaries; return null when the log is ambiguous. */
export function parseTestLogSummary(log: string): ParsedTestSummary | null {
  return parsePytest(log) || parseVitest(log) || parseJest(log);
}
