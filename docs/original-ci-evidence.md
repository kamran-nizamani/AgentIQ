# Original CI test evidence

AgentIQ must evaluate the test result produced by the workflow run being evaluated. It must not rerun tests in a later collector workflow and label that new execution as evidence from the original run.

## GitHub Actions setup

The repository's CI workflow should write a machine-readable report during its own test step and upload it as an artifact:

```yaml
- name: Run tests and write an original-run report
  run: npm test -- --reporter=json --outputFile=test-results.json

- name: Upload original-run test report for AgentIQ
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: agentiq-test-results
    path: test-results.json
    if-no-files-found: ignore
    retention-days: 14
```

The AgentIQ Evidence `workflow_run` collector downloads that artifact using the triggering workflow's run ID. It validates the report counts and binds the resulting evidence to the triggering repository, workflow run ID, and commit SHA.

## Important behavior

- The collector does **not** check out the code or execute the test suite again.
- Failed CI runs are still eligible for evidence collection. The test report is uploaded with `if: always()` when the test command produced it.
- If the original run did not produce or upload the report, AgentIQ does not create test evidence. The live evaluation remains provisional because test evidence is unavailable.
- A collector run ID is recorded separately from the original CI run ID. The collector's execution is not confused with the evaluated execution.
- Test counts must be non-negative safe integers and must add up exactly to the reported total. Invalid reports fail closed.
- Artifact retention is configurable. If the original artifact expires before collection, the test evidence is unavailable rather than reconstructed.

## Supported report format

The current GitHub Actions collector expects Vitest/Jest-compatible JSON fields:

- `numTotalTests`
- `numPassedTests`
- `numFailedTests`
- optional `numPendingTests` and `numTodoTests`

Other formats are supported by the core parser, but need an adapter that downloads the original report and binds it to the same repository/run/commit identity.
