export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export type WorkflowRun = {
  id: number;
  name: string;
  html_url: string;
  status: string;
  conclusion: string | null;
  head_sha?: string;
};

const TEST_PATH = /(^|\/)(__tests__|tests?|spec)(\/|\.)|\.(test|spec)\.[^.]+$/i;
const DEPENDENCY_PATH = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Cargo\.lock|go\.mod|go\.sum)$/i;

/** Builds proposals from actual GitHub changed-file patches; it never fabricates a patch. */
export function buildDiffEvidence(files: DiffFile[], runs: WorkflowRun[]) {
  const boundedFiles = files.slice(0, 30).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: typeof file.patch === "string" ? file.patch.slice(0, 12000) : null,
    patchAvailable: typeof file.patch === "string" && file.patch.length > 0,
  }));
  const changedTests = files.filter((file) => TEST_PATH.test(file.filename)).map((file) => file.filename);
  const dependencyFiles = files.filter((file) => DEPENDENCY_PATH.test(file.filename)).map((file) => file.filename);
  const workflowFiles = files.filter((file) => file.filename.startsWith(".github/workflows/")).map((file) => file.filename);
  const proposals: Array<{ id: string; title: string; rationale: string; suggestedAction: string; evidenceFiles: string[] }> = [];

  if (changedTests.length === 0) {
    proposals.push({
      id: "regression-test-coverage",
      title: "Add or identify a focused regression test",
      rationale: "The pull request's changed-file list contains no paths matching common test/spec naming conventions. This is a coverage prompt, not proof that tests are missing.",
      suggestedAction: "Identify the changed behavior, add a regression test that fails before the fix and passes after it, then run the focused test and full CI suite.",
      evidenceFiles: files.slice(0, 12).map((file) => file.filename),
    });
  }
  if (dependencyFiles.length) {
    proposals.push({
      id: "dependency-validation",
      title: "Validate dependency and lockfile changes",
      rationale: "Dependency manifests or lockfiles are present in the actual PR file list.",
      suggestedAction: "Review the version delta, run the package manager audit and clean install, then run focused tests and the production build.",
      evidenceFiles: dependencyFiles,
    });
  }
  if (workflowFiles.length) {
    proposals.push({
      id: "workflow-permissions",
      title: "Review CI workflow permissions and trust boundaries",
      rationale: "Workflow definitions are among the changed files.",
      suggestedAction: "Check token permissions, event triggers, third-party action pinning, and whether untrusted pull-request code can access write credentials.",
      evidenceFiles: workflowFiles,
    });
  }
  if (files.some((file) => /(^|\/)(\.env(\.|$)|secrets?\.|credentials?\.|.*\.(pem|key)$)/i.test(file.filename))) {
    proposals.push({
      id: "sensitive-file-review",
      title: "Inspect sensitive-looking file changes",
      rationale: "A changed path resembles environment, credential, or private-key material.",
      suggestedAction: "Inspect the full patch for secrets. If any credential was exposed, rotate it and move it to a secret manager.",
      evidenceFiles: files.filter((file) => /(^|\/)(\.env(\.|$)|secrets?\.|credentials?\.|.*\.(pem|key)$)/i.test(file.filename)).map((file) => file.filename),
    });
  }
  if (!proposals.length) {
    proposals.push({
      id: "diff-review",
      title: "Review the exact diff and validate behaviour",
      rationale: "No specialized deterministic proposal matched the changed-file metadata.",
      suggestedAction: "Review the linked patch, confirm expected behaviour, and run focused tests plus the full CI suite before approval.",
      evidenceFiles: files.slice(0, 12).map((file) => file.filename),
    });
  }

  return {
    files: boundedFiles,
    changedTests,
    testsChanged: changedTests.length > 0,
    workflowRuns: runs.slice(0, 10).map((run) => ({
      id: run.id,
      name: run.name,
      url: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
    })),
    proposals,
    evidence: {
      filesReported: files.length,
      filesWithPatch: files.filter((file) => typeof file.patch === "string" && file.patch.length > 0).length,
      testsChanged: changedTests.length,
      workflowRunsFound: runs.length,
      note: "Patch text and workflow statuses come from GitHub. A missing patch or missing run is unknown, not a passing check.",
    },
  };
}

export type ApprovalDecision = "approved" | "rejected";

export function formatApprovalAuditComment(input: {
  proposalId: string;
  decision: ApprovalDecision;
  repository: string;
  pullNumber: number;
  headSha: string;
  checks: Record<string, boolean>;
  note?: string;
  recordedAt?: string;
}): string {
  const marker = "<!-- agentiq-remediation-audit:v1 -->";
  const checks = Object.entries(input.checks).map(([key, value]) => "- " + key + ": " + (value ? "checked" : "not checked"));
  return [
    marker,
    "## AgentIQ remediation review",
    "",
    "- Decision: **" + input.decision.toUpperCase() + "**",
    "- Proposal: `" + input.proposalId + "`",
    "- Repository: `" + input.repository + "`",
    "- Pull request: #" + input.pullNumber,
    "- Reviewed head commit: `" + input.headSha + "`",
    "- Recorded at: " + (input.recordedAt || new Date().toISOString()),
    "- Identity: dashboard operator; identity is not independently verified by AgentIQ",
    "",
    "### Review checklist",
    ...checks,
    "",
    "### Operator note",
    input.note?.trim() ? input.note.trim().slice(0, 1000) : "No note provided.",
    "",
    "This is a persistent review record only. AgentIQ did not apply code, execute commands, push commits, or merge this pull request.",
  ].join("\n");
}
