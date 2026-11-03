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

## Verified AI-agent and task attribution

GitHub Actions is the CI runner, not the AI coding agent. AgentIQ therefore displays a run as **Unattributed** unless the original workflow uploads an artifact named `agentiq-agent-metadata` containing `agentiq-run-metadata.json`.

Configure these optional GitHub Actions repository variables when a workflow is genuinely launched by an AI coding agent:

- `AGENTIQ_AGENT_PROVIDER` and `AGENTIQ_AGENT_NAME` (required)
- `AGENTIQ_TASK_ID` and `AGENTIQ_TASK_DESCRIPTION` (required)
- `AGENTIQ_AGENT_VERSION`, `AGENTIQ_MODEL_PROVIDER`, `AGENTIQ_MODEL_NAME`, and `AGENTIQ_MODEL_VERSION` (optional)

Example metadata file:

```json
{
  "schemaVersion": "1.0",
  "agent": { "provider": "openai", "name": "Codex" },
  "model": { "provider": "openai", "name": "model-name" },
  "task": { "id": "issue-123", "description": "Fix the pagination regression" }
}
```

The collector downloads this file from the exact triggering CI run, then binds agent-run evidence to the original repository, workflow run ID, and commit SHA. Metadata is optional: absent metadata means **unattributed**, not an inferred agent. Agent identity is supplied by the workflow integration; AgentIQ does not independently prove which process authored the code. Do not configure these variables for ordinary CI-only runs.
