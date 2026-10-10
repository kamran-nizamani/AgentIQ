import { useMemo, useState, type FormEvent } from "react";

type Finding = { severity: "high" | "medium" | "info"; title: string; detail: string; recommendation: string; evidence: string };
type HealthComponent = { key: string; label: string; score: number | null; weight: number; detail: string };
type RepoInsight = {
  repository: { fullName: string; name: string; url: string; description: string | null; private: boolean; archived: boolean; defaultBranch: string; language: string | null; stars: number; forks: number; openIssues: number; pushedAt: string | null; license: string };
  health: { score: number | null; grade: string; coverage: number; components: HealthComponent[] };
  ci: { totalReported: number | null; recentRuns: number; completedRuns: number; successRate: number | null; failures: Array<{ id: number; name: string; url: string; branch: string; number: number; createdAt: string; status: string; conclusion: string | null }>; failedJobDetails: Array<{ runId: number; failedJobs: Array<{ name: string; steps: string[] }>; available: boolean }>; available: boolean };
  pullRequests: { available: boolean; openCount: number | null; reviews: Array<{ number: number; title: string; url: string; author: string; updatedAt: string; createdAt: string; draft: boolean; branch: string; baseBranch: string; changedFiles: number; additions: number; deletions: number; findings: Finding[]; reviewMode: "ai-assisted" | "heuristic"; filesAvailable: boolean; hasPatchEvidence: boolean }> };
  security: { available: boolean; openCount: number | null; alerts: Array<{ number: number; url: string; state: string; packageName: string; severity: string; summary: string; patchedVersion: string | null; manifestPath: string }>; note: string };
  maintenance: { lastPushAgeDays: number | null; archived: boolean; openIssues: number; staleOpenIssues: number; issues: Array<{ number: number; title: string; url: string; updatedAt: string; ageDays: number | null }> };
  meta: { generatedAt: string; authenticated: boolean; rootContentsAvailable: boolean; readmeAvailable: boolean };
};
type Result = { ok: true; data: RepoInsight } | { ok: false; input: string; error: { code: string; message: string } };

function ago(value: string): string {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return "time unavailable";
  const days = Math.max(0, Math.floor((Date.now() - date) / 86400000));
  return days === 0 ? "today" : days === 1 ? "1 day ago" : days + " days ago";
}
function severityClass(value: string): string {
  return value === "high" || value === "critical" ? "intel-severity high" : value === "medium" || value === "moderate" ? "intel-severity medium" : "intel-severity info";
}
function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "agentiq-intelligence-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function safePlan(title: string, recommendation: string, evidence: string): string[] {
  return [
    "Inspect the linked source and confirm the finding applies to this repository.",
    recommendation,
    "Create a focused branch and make the smallest reversible change; do not edit production directly.",
    "Run the repository's existing tests, lint, build, and relevant security checks in an isolated environment.",
    "Review the resulting diff and CI evidence, then request human approval before opening or merging a remediation PR.",
    "Evidence observed: " + evidence,
  ];
}

export default function Intelligence() {
  const [input, setInput] = useState("kamran-nizamani/AgentIQ");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<{ title: string; steps: string[] } | null>(null);
  const [tab, setTab] = useState<"overview" | "ci" | "reviews" | "security">("overview");
  const successful = useMemo(() => results.filter((result): result is Extract<Result, { ok: true }> => result.ok).map((result) => result.data), [results]);
  const totalFailures = successful.reduce((sum, repo) => sum + repo.ci.failures.length, 0);
  const totalAlerts = successful.reduce((sum, repo) => sum + (repo.security.openCount || 0), 0);
  const totalReviewFindings = successful.reduce((sum, repo) => sum + repo.pullRequests.reviews.reduce((count, pr) => count + pr.findings.filter((finding) => finding.severity !== "info").length, 0), 0);

  async function inspect(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const repos = [...new Set(input.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))].slice(0, 5);
    if (!repos.length) { setError("Enter at least one GitHub repository."); return; }
    setLoading(true);
    setError("");
    setPlan(null);
    try {
      const params = new URLSearchParams();
      repos.forEach((repo) => params.append("repo", repo));
      const response = await fetch("/api/intelligence?" + params.toString(), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Repository intelligence request failed.");
      setResults(body.data as Result[]);
      if (!body.data?.some((item: Result) => item.ok)) setError("None of the supplied repositories could be inspected. Review the individual errors below.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load repository intelligence.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="intelligence-page">
    <section className="panel intel-intro">
      <div className="intel-intro-copy"><span className="intel-kicker">AGENTIQ ENGINEERING INTELLIGENCE</span><h2>From repository signals to actionable evidence.</h2><p>Inspect up to five repositories together. Health scores use only available evidence; inaccessible data stays unknown instead of being treated as healthy.</p></div>
      <form className="intel-form" onSubmit={inspect}>
        <label htmlFor="intel-repositories">GitHub repositories <span>one URL or owner/repo per line · max 5</span></label>
        <textarea id="intel-repositories" value={input} onChange={(event) => setInput(event.target.value)} placeholder={"kamran-nizamani/AgentIQ\nfacebook/react\nvercel/next.js"} rows={3} />
        <div className="intel-form-footer"><span>Public repos work without login. Private repo access needs a server-side token.</span><button className="primary-button" type="submit" disabled={loading}>{loading ? "Analysing…" : "Analyse repositories"}</button></div>
      </form>
      {error && <p className="intel-error" role="alert">{error}</p>}
    </section>

    {loading && <section className="panel intel-loading"><span className="inspector-spinner" /><div><strong>Collecting engineering evidence…</strong><p>Reading recent Actions runs, pull requests, dependency alerts, and maintenance signals.</p></div></section>}

    {successful.length > 0 && <>
      <section className="intel-summary-grid">
        <div className="panel intel-summary-card"><span>Repositories inspected</span><strong>{successful.length}<small>/{results.length}</small></strong><p>Successful inspections</p></div>
        <div className="panel intel-summary-card"><span>Recent CI failures</span><strong className={totalFailures ? "intel-danger-text" : ""}>{totalFailures}</strong><p>Across sampled recent runs</p></div>
        <div className="panel intel-summary-card"><span>Security alerts</span><strong className={totalAlerts ? "intel-danger-text" : ""}>{successful.some((repo) => repo.security.available) ? totalAlerts : "N/A"}</strong><p>{successful.some((repo) => repo.security.available) ? "Alerts exposed by GitHub" : "Alert access unavailable"}</p></div>
        <div className="panel intel-summary-card"><span>PR review prompts</span><strong>{totalReviewFindings}</strong><p>Heuristic prompts, not confirmed bugs</p></div>
      </section>
      <section className="intel-tabs" role="tablist" aria-label="Intelligence views">
        {([{id:"overview",label:"Health & comparison"},{id:"ci",label:"CI failure intelligence"},{id:"reviews",label:"PR review assistant"},{id:"security",label:"Security & dependencies"}] as const).map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
        <button className="intel-export" onClick={() => downloadJson(results)}>Export JSON report</button>
      </section>

      {tab === "overview" && <div className="intel-repo-grid">{successful.map((repo) => <article className="panel intel-repo-card" key={repo.repository.fullName}>
        <div className="intel-repo-head"><div><a href={repo.repository.url} target="_blank" rel="noreferrer">{repo.repository.fullName}</a><p>{repo.repository.description || "No description provided."}</p></div><div className="intel-grade"><strong>{repo.health.score === null ? "—" : repo.health.score}</strong><span>{repo.health.grade} · /100</span></div></div>
        <div className="intel-health-track"><i style={{ width: (repo.health.score ?? 0) + "%" }} /></div>
        <div className="intel-repo-stats"><span>★ {repo.repository.stars.toLocaleString()}</span><span>{repo.repository.language || "Language unknown"}</span><span>{repo.repository.license}</span><span>{repo.repository.archived ? "Archived" : repo.maintenance.lastPushAgeDays === null ? "Push date unknown" : "Pushed " + repo.maintenance.lastPushAgeDays + "d ago"}</span></div>
        <div className="intel-coverage"><span>Evidence coverage</span><strong>{repo.health.coverage}%</strong></div>
        <div className="intel-component-list">{repo.health.components.map((component) => <div key={component.key}><span>{component.label}<small>{component.detail}</small></span><strong className={component.score === null ? "muted" : component.score >= 80 ? "good" : component.score >= 60 ? "medium" : "bad"}>{component.score === null ? "N/A" : Math.round(component.score)}</strong></div>)}</div>
        <div className="intel-card-footer"><span>{repo.ci.successRate === null ? "CI success rate unknown" : repo.ci.successRate + "% recent CI success"} · {repo.pullRequests.openCount === null ? "PR data unknown" : repo.pullRequests.openCount + " open PRs returned"}</span><button onClick={() => setTab("ci")}>Investigate signals →</button></div>
      </article>)}
      {results.filter((result) => !result.ok).map((result) => <article className="panel intel-repo-card intel-failed-card" key={result.input}><strong>{result.input}</strong><p>{result.error.message}</p></article>)}</div>}

      {tab === "ci" && <div className="intel-section-list">{successful.map((repo) => <section className="panel intel-detail-card" key={repo.repository.fullName}>
        <div className="intel-section-head"><div><h3>{repo.repository.fullName}</h3><p>{repo.ci.completedRuns} completed of {repo.ci.recentRuns} recent runs · {repo.ci.totalReported === null ? "total unavailable" : repo.ci.totalReported + " total runs reported"}</p></div><strong>{repo.ci.successRate === null ? "N/A" : repo.ci.successRate + "%"}<small>success rate</small></strong></div>
        {!repo.ci.available && <p className="intel-note">Actions data was unavailable. No conclusion about CI health can be made.</p>}
        {repo.ci.failures.length === 0 ? <p className="intel-note">No failed runs in the returned sample. This is not proof that every workflow is passing.</p> : <div className="intel-failure-list">{repo.ci.failures.map((run) => { const detail = repo.ci.failedJobDetails.find((item) => item.runId === run.id); return <div className="intel-failure" key={run.id}><span className="intel-run-status">×</span><div><a href={run.url} target="_blank" rel="noreferrer">{run.name} · #{run.number}</a><small>{run.branch} · {ago(run.createdAt)} · {run.conclusion}</small>{detail?.failedJobs.length ? detail.failedJobs.map((job) => <p key={job.name}><b>{job.name}</b>{job.steps.length ? " — failed step: " + job.steps.join(", ") : " — failed job; step detail unavailable"}</p>) : <p>Failed run observed; job-level root cause was not available from the sampled API data.</p>}</div><button onClick={() => { setPlan({ title: "CI remediation plan · " + run.name, steps: safePlan("CI failure", "Reproduce this exact run on its branch, inspect the failed job and logs, identify the first causal error, then add a regression test before applying a focused fix.", run.url) }); }}>Build fix plan</button></div>; })}</div>}
      </section>)}</div>}

      {tab === "reviews" && <div className="intel-section-list">{successful.map((repo) => <section className="panel intel-detail-card" key={repo.repository.fullName}>
        <div className="intel-section-head"><div><h3>{repo.repository.fullName}</h3><p>{repo.pullRequests.openCount === null ? "Pull request access unavailable" : repo.pullRequests.openCount + " open PRs · " + repo.pullRequests.reviews.length + " PRs analysed"}</p></div></div>
        {!repo.pullRequests.available && <p className="intel-note">GitHub did not expose pull requests to this request.</p>}
        {repo.pullRequests.reviews.map((pr) => <div className="intel-pr-review" key={pr.number}>
          <div className="intel-pr-heading"><div><a href={pr.url} target="_blank" rel="noreferrer">#{pr.number} {pr.title}</a><small>{pr.author} · {pr.branch} → {pr.baseBranch} · updated {ago(pr.updatedAt)}{pr.draft ? " · draft" : ""}</small></div><span>{pr.changedFiles} files</span></div>
          <p className="intel-note">Change size: +{pr.additions} / −{pr.deletions} lines. {pr.reviewMode === "ai-assisted" ? "AI-assisted diff review." : "Deterministic heuristic review; configure AGENTIQ_AI_API_KEY for optional model-assisted analysis."} {pr.hasPatchEvidence ? "Patch metadata available." : "Patch text unavailable; findings use changed-file metadata only."}</p>
          <div className="intel-finding-list">{pr.findings.map((finding, index) => <div className="intel-finding" key={finding.title + index}><span className={severityClass(finding.severity)}>{finding.severity}</span><div><strong>{finding.title}</strong><p>{finding.detail}</p><small>Evidence: {finding.evidence}</small><p className="intel-recommendation">{finding.recommendation}</p></div><button onClick={() => setPlan({ title: "Safe remediation plan · PR #" + pr.number + " · " + finding.title, steps: safePlan(finding.title, finding.recommendation, finding.evidence) })}>Plan</button></div>)}</div>
        </div>)}
        {repo.pullRequests.available && repo.pullRequests.reviews.length === 0 && <p className="intel-note">No open pull requests were returned. Closed and merged PRs are not included in this sample.</p>}
      </section>)}</div>}

      {tab === "security" && <div className="intel-section-list">{successful.map((repo) => <section className="panel intel-detail-card" key={repo.repository.fullName}>
        <div className="intel-section-head"><div><h3>{repo.repository.fullName}</h3><p>{repo.repository.license} · {repo.repository.openIssues} open issues · {repo.maintenance.staleOpenIssues} issues not updated in 90 days</p></div><strong>{repo.security.available ? repo.security.openCount : "N/A"}<small>alerts returned</small></strong></div>
        <p className="intel-note">{repo.security.note}</p>
        {repo.security.alerts.map((alert) => <div className="intel-alert" key={alert.number}><span className={severityClass(alert.severity)}>{alert.severity}</span><div><a href={alert.url} target="_blank" rel="noreferrer">{alert.packageName}: {alert.summary}</a><small>{alert.manifestPath || "Manifest path unavailable"}{alert.patchedVersion ? " · patched in " + alert.patchedVersion : ""}</small></div><button onClick={() => setPlan({ title: "Dependency remediation plan · " + alert.packageName, steps: safePlan("Dependency alert", "Verify the advisory and affected version range, update to the first patched compatible version, regenerate the lockfile, and run audit, build, and tests.", alert.url) })}>Plan fix</button></div>)}
        {repo.security.available && repo.security.alerts.length === 0 && <p className="intel-note">GitHub returned no open Dependabot alerts for this request. Other scanners or private advisories may not be represented.</p>}
      </section>)}</div>}
    </>}

    {plan && <section className="panel intel-plan-panel"><div className="intel-section-head"><div><span className="intel-kicker">HUMAN-APPROVED REMEDIATION</span><h3>{plan.title}</h3><p>Actionable plan based on available evidence; no repository files have been changed.</p></div><button className="secondary-button" onClick={() => setPlan(null)}>Close</button></div><ol>{plan.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><p className="intel-note">Safety boundary: this version generates a reviewable plan only. It does not execute untrusted code, push commits, create PRs, or merge changes automatically.</p></section>}

    {results.length === 0 && !loading && <section className="intel-empty-state"><div className="intel-empty-icon">✦</div><h3>Ready to inspect repository health</h3><p>Get a comparable view of CI reliability, maintenance signals, open security alerts, and PR review prompts. Try adding facebook/react or vercel/next.js to compare repositories.</p><button className="secondary-button" onClick={() => setInput("kamran-nizamani/AgentIQ\nfacebook/react\nvercel/next.js")}>Load comparison examples</button></section>}
    <p className="intel-disclaimer">Evidence-driven, not omniscient. Health scores are heuristic summaries of accessible GitHub signals, not a security certification. Static PR prompts are not confirmed defects. Missing permissions, disabled Actions, rate limits, and absent reports remain unknown.</p>
  </section>;
}
