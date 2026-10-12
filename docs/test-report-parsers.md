# Test report parsers

AgentIQ's core parser normalizes aggregate results from common CI test-report formats into a framework-tagged summary. It does not execute report contents or treat missing data as a pass.

Supported inputs:

- **JUnit XML**: per-testcase pass/fail/error/skip states, testcase durations, or suite-level counters when individual cases are omitted.
- **Jest JSON**: `numTotalTests`, `numPassedTests`, `numFailedTests`, pending/todo counts, and optional start/end timestamps.
- **Vitest JSON**: Jest-compatible aggregate JSON output.
- **pytest-json-report**: `summary` counts and total duration in seconds.

Example:

```ts
import { parseTestReport } from "./src/test-report-parser.js";

const report = parseTestReport(xmlText, "junit-xml");
// report.total / passed / failed / skipped / durationMs / warnings
```

The input is limited to 5 MiB. Unsupported or malformed formats, negative/non-integer counts, and inconsistent totals fail closed with an error. If aggregate counts omit an outcome category, the parser reports a warning rather than inferring that the tests passed. JUnit XML parsing is deliberately dependency-free and extracts aggregate facts only; it is not a validating XML parser.

This is the deterministic parsing layer. CI adapters still need to fetch/download report artifacts, select the correct format, and attach repository, commit, workflow-run, and provenance identifiers before the evidence can affect a production evaluation.
