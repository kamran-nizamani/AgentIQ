import { describe, expect, it } from "vitest";
import { formatCsv } from "./intelligence-export.js";

describe("formatCsv", () => {
  it("writes a stable header and quotes commas, quotes, and line breaks", () => {
    expect(formatCsv([{ repository: "owner/repo", title: 'Needs "review", now', details: "line one\nline two" }])).toBe('repository,title,details\r\nowner/repo,"Needs ""review"", now","line one\nline two"\r\n');
  });

  it("keeps heterogeneous rows aligned to the union of their columns", () => {
    expect(formatCsv([{ repository: "a/b", severity: "high" }, { repository: "c/d", url: "https://example.com" }])).toBe('repository,severity,url\r\na/b,high,\r\nc/d,,https://example.com\r\n');
  });

  it("neutralizes spreadsheet formula prefixes in untrusted values", () => {
    expect(formatCsv([{ title: '=HYPERLINK("https://example.com")' }, { title: "  @SUM(A1:A2)" }, { title: "-1" }])).toBe('title\r\n\'=HYPERLINK(""https://example.com"")\r\n\'  @SUM(A1:A2)\r\n\'-1\r\n');
  });

  it("returns an empty string for no rows", () => {
    expect(formatCsv([])).toBe("");
  });
});
