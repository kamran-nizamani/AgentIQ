export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Prevent spreadsheet applications from evaluating untrusted repository text as a formula.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function formatCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.map(cell).join(","), ...rows.map((row) => headers.map((header) => cell(row[header])).join(","))].join("\r\n") + "\r\n";
}
