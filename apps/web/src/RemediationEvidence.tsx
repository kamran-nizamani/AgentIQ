import { useState } from "react";

type EvidenceFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
  patchAvailable: boolean;
};
type Proposal = { id: string; title: string; rationale: string; suggestedAction: string; evidenceFiles: string[] };
type AuditEntry = { id: number; url: string; createdAt: string; updatedAt: string; author: string; decision: string; body: string };
type EvidenceResponse = {
  repository: string;
  pullRequest: { number: number; title: string; url: string; state: string; headBranch: string; headSha: string; baseBranch: string };
  files: EvidenceFile[];
  changedTests: string[];
  testsChanged: boolean;
  workflowRuns: Array<{ id: number; name: string; url: string; status: string; conclusion: string | null }>;
  proposals: Proposal[];
  evidence: { filesReported: number; filesWithPatch: number; testsChanged: number; workflowRunsFound: number; note: string };
  audit: AuditEntry[];
  auditWritable: boolean;
  auditSetupRequired: string | null;
};
type CheckKey = "evidenceReviewed" | "testsDefined" | "rollbackDefined" | "diffReviewed";
const checksList: Array<{ key: CheckKey; label: string }> = [
  { key: "evidenceReviewed", label: "I reviewed the actual GitHub patch and source PR." },
  { key: "testsDefined", label: "Regression tests are identified and CI evidence is understood." },
  { key: "rollbackDefined", label: "The change is reversible and scoped to a branch." },
  { key: "diffReviewed", label: "I checked for unrelated changes and reviewed the latest commit SHA." },
];

export default function RemediationEvidence({ repository, pullNumber, pullTitle }: { repository: string; pullNumber: number; pullTitle: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState("");
  const [auditToken, setAuditToken] = useState("");
  const [note, setNote] = useState("");
  const [selectedProposal, setSelectedProposal] = useState("");
  const [checks, setChecks] = useState<Record<CheckKey, boolean>>({
    evidenceReviewed: false, testsDefined: false, rollbackDefined: false, diffReviewed: false,
  });

  async function loadEvidence() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ repo: repository, pr: String(pullNumber) });
      const response = await fetch("/api/remediation?" + params.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Could not load real diff evidence.");
      const next = body.data as EvidenceResponse;
      setEvidence(next);
      setSelectedProposal((current) => current || next.proposals[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load real diff evidence.");
    } finally {
      setLoading(false);
    }
  }

  async function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next && !evidence) await loadEvidence();
  }

  async function recordDecision(decision: "approved" | "rejected") {
    if (!evidence) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/remediation?repo=" + encodeURIComponent(repository) + "&pr=" + pullNumber, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + auditToken },
        body: JSON.stringify({
          decision,
          proposalId: selectedProposal,
          headSha: evidence.pullRequest.headSha,
          checks,
          note,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Could not persist the review decision.");
      await loadEvidence();
      setNote("");
      setChecks({ evidenceReviewed: false, testsDefined: false, rollbackDefined: false, diffReviewed: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not persist the review decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const proposal = evidence?.proposals.find((item) => item.id === selectedProposal);
  return <section className="intel-real-evidence">
    <button className="secondary-button" type="button" onClick={() => void togglePanel()}>{open ? "Hide real diff & audit" : "View real diff + persistent review"} ↗</button>
    {open && <div className="intel-real-evidence-panel">
      <div className="intel-real-evidence-heading">
        <div><strong>Real diff evidence · PR #{pullNumber}</strong><p>{pullTitle}</p></div>
        {evidence && <a href={evidence.pullRequest.url} target="_blank" rel="noreferrer">Open source PR ↗</a>}
      </div>
      {loading && <p className="intel-note">Fetching actual file patches, test paths, workflow runs, and review history from GitHub…</p>}
      {error && <p className="intel-error" role="alert">{error}</p>}
      {evidence && <>
        <div className="intel-evidence-stats">
          <span>{evidence.evidence.filesReported} files changed</span>
          <span>{evidence.evidence.filesWithPatch} actual patches available</span>
          <span>{evidence.changedTests.length} test files changed</span>
          <span>{evidence.evidence.workflowRunsFound} matching workflow runs</span>
        </div>
        <p className="intel-note">{evidence.evidence.note}</p>
        <div className="intel-diff-file-list">
          {evidence.files.map((file) => <details key={file.filename} className="intel-diff-file">
            <summary><code>{file.filename}</code><span>{file.status} · +{file.additions} / −{file.deletions}</span></summary>
            {file.patchAvailable && file.patch ? <pre>{file.patch}</pre> : <p className="intel-note">GitHub did not provide patch text for this file. Open the source PR to inspect the complete diff.</p>}
          </details>)}
        </div>
        <div className="intel-test-evidence">
          <h4>Regression-test evidence</h4>
          {evidence.testsChanged ? <p>Test-like paths in this PR: {evidence.changedTests.join(", ")}</p> : <p className="intel-note">No test-like path was detected in this PR's changed-file list. This does not prove tests are absent elsewhere.</p>}
          <h4>Workflow evidence</h4>
          {evidence.workflowRuns.length ? evidence.workflowRuns.map((run) => <p key={run.id}><a href={run.url} target="_blank" rel="noreferrer">{run.name} #{run.id}</a> — {run.status} / {run.conclusion || "no conclusion"}</p>) : <p className="intel-note">No workflow run matching the reviewed head commit was found. CI is unknown, not passing.</p>}
        </div>
        <div className="intel-generated-proposals">
          <h4>Evidence-derived fix proposals</h4>
          <p className="intel-note">These are deterministic review suggestions derived from the actual changed-file list. AgentIQ has not generated or applied a source-code patch.</p>
          {evidence.proposals.map((item) => <label className="intel-proposal-choice" key={item.id}>
            <input type="radio" name={"proposal-" + repository + "-" + pullNumber} checked={selectedProposal === item.id} onChange={() => setSelectedProposal(item.id)} />
            <span><strong>{item.title}</strong><small>{item.rationale}</small><span>{item.suggestedAction}</span><small>Evidence files: {item.evidenceFiles.length ? item.evidenceFiles.join(", ") : "No matching file path"}</small></span>
          </label>)}
        </div>
        <div className="intel-persistent-audit">
          <h4>Persistent human review</h4>
          <p className="intel-note">A decision is saved as a GitHub PR comment. It is bound to the exact head SHA above; if the PR changes, reload evidence before approving. Approval does not apply code, run commands, push commits, or merge.</p>
          {evidence.auditSetupRequired && <p className="intel-note">{evidence.auditSetupRequired}</p>}
          <label>Audit token <input type="password" autoComplete="off" value={auditToken} onChange={(event) => setAuditToken(event.target.value)} placeholder="Server-configured reviewer token" /></label>
          <label>Review note (optional) <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Why is this proposal approved or rejected?" /></label>
          {checksList.map((item) => <label className="intel-audit-check" key={item.key}><input type="checkbox" checked={checks[item.key]} onChange={(event) => setChecks((current) => ({ ...current, [item.key]: event.target.checked }))} />{item.label}</label>)}
          <div className="intel-audit-actions">
            <button className="primary-button" type="button" disabled={submitting || loading || !auditToken.trim() || !selectedProposal || !checksList.every((item) => checks[item.key])} onClick={() => void recordDecision("approved")}>{submitting ? "Saving…" : "Record approval"}</button>
            <button className="secondary-button" type="button" disabled={submitting || loading || !auditToken.trim() || !selectedProposal} onClick={() => void recordDecision("rejected")}>Record rejection</button>
            <button className="secondary-button" type="button" disabled={submitting || loading} onClick={() => void loadEvidence()}>Refresh evidence</button>
          </div>
          <h4>Audit history from GitHub</h4>
          {evidence.audit.length ? <div className="intel-audit-history">{evidence.audit.map((entry) => <article key={entry.id}>
            <strong>{entry.decision.toUpperCase()} · {new Date(entry.createdAt).toLocaleString()}</strong>
            <small>Recorded by GitHub account: {entry.author} · <a href={entry.url} target="_blank" rel="noreferrer">Open audit comment ↗</a></small>
            <p>{entry.body.replace(/<!-- agentiq-remediation-audit:v1 -->/, "").slice(0, 500)}</p>
          </article>)}</div> : <p className="intel-note">No AgentIQ audit entries have been recorded on this PR yet.</p>}
        </div>
      </>}
    </div>}
  </section>;
}
