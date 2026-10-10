import { useEffect, useState, type FormEvent } from "react";

type RunRow = {
  id: number; name: string; title: string; url: string; workflowUrl: string | null;
  status: string; conclusion: string | null; createdAt: string; updatedAt: string; startedAt: string | null;
  runNumber: number; attempt: number; event: string; branch: string; commitSha: string; commitUrl: string;
  workflowPath: string; actor: string; actorUrl: string | null; triggeredBy: string | null;
  commitMessage: string | null; commitAuthor: string | null;
  pullRequests: Array<{ number: number; url: string; head: string | null; base: string | null }>;
};
type ListResponse = { data: { repository: string; total: number; page: number; perPage: number; pageCount: number; items: RunRow[]; meta: { note: string } } };
type RunDetail = {
  repository: string; run: RunRow;
  jobs: { available: boolean; total: number | null; items: Array<{ id: number; name: string; status: string; conclusion: string | null; url: string; startedAt: string | null; completedAt: string | null; runner: string | null; steps: Array<{ name: string; number: number; status: string; conclusion: string | null; startedAt: string | null; completedAt: string | null }> }> };
  artifacts: { available: boolean; total: number | null; items: Array<{ id: number; name: string; sizeBytes: number; expired: boolean; createdAt: string; expiresAt: string }> };
  meta: { note: string };
};
type DetailResponse = { data: RunDetail };
const statuses = ["all", "completed", "in_progress", "queued", "success", "failure", "cancelled", "timed_out", "action_required", "skipped"];
const events = ["all", "push", "pull_request", "pull_request_target", "workflow_dispatch", "workflow_run", "schedule", "release", "merge_group"];

function ago(value: string | null): string {
  if (!value) return "not recorded";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "time unavailable";
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  if (mins < 1440) return Math.floor(mins / 60) + "h ago";
  return Math.floor(mins / 1440) + "d ago";
}
function duration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = Math.max(0, Date.parse(end) - Date.parse(start));
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s";
}
function statusClass(status: string, conclusion: string | null): string {
  const value = (conclusion || status).toLowerCase();
  if (value === "success") return "repo-run-badge success";
  if (["failure", "timed_out", "action_required"].includes(value)) return "repo-run-badge failure";
  if (["in_progress", "queued", "waiting", "requested", "pending"].includes(value)) return "repo-run-badge running";
  if (["cancelled", "skipped", "neutral", "stale"].includes(value)) return "repo-run-badge neutral";
  return "repo-run-badge";
}
function pretty(value: string | null): string { return value ? value.replace(/_/g, " ") : "pending"; }
function bytes(value: number): string { return value < 1024 ? value + " B" : value < 1024 * 1024 ? (value / 1024).toFixed(1) + " KB" : (value / 1024 / 1024).toFixed(1) + " MB"; }

export default function RepositoryRuns({ repository }: { repository: string }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [event, setEvent] = useState("all");
  const [branch, setBranch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [data, setData] = useState<ListResponse["data"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setData(null); setSelectedId(null); setDetail(null);
      const params = new URLSearchParams({ repo: repository, page: String(page), per_page: "25" });
      if (status !== "all") params.set("status", status);
      if (event !== "all") params.set("event", event);
      if (branchFilter.trim()) params.set("branch", branchFilter.trim());
      try {
        const response = await fetch("/api/repository-runs?" + params.toString(), { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || "Could not load workflow runs.");
        setData((body as ListResponse).data);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load workflow runs for this repository.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [repository, page, status, event, branchFilter]);

  useEffect(() => {
    if (selectedId === null) { setDetail(null); setDetailError(""); return; }
    const controller = new AbortController();
    async function load() {
      setDetailLoading(true); setDetailError(""); setDetail(null);
      try {
        const params = new URLSearchParams({ repo: repository, run_id: String(selectedId) });
        const response = await fetch("/api/repository-runs?" + params.toString(), { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || "Could not load run details.");
        setDetail((body as DetailResponse).data);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setDetailError(cause instanceof Error ? cause.message : "Could not load workflow run details.");
      } finally { if (!controller.signal.aborted) setDetailLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [repository, selectedId]);

  function applyBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(1); setBranchFilter(branch.trim());
  }

  return <section className="panel repository-runs-panel">
    <div className="repo-runs-heading">
      <div><span className="inspector-eyebrow">GITHUB ACTIONS · {repository}</span><h3>Complete workflow run history</h3><p>Browse paginated runs for the repository you inspected, filter by status, trigger, or branch, and open a run for job, step, commit, and artifact details.</p></div>
      {data && <div className="repo-runs-total"><strong>{data.total.toLocaleString()}</strong><span>runs reported</span></div>}
    </div>
    <form className="repo-runs-filters" onSubmit={applyBranch}>
      <label>Status<select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}><option value="all">All statuses</option>{statuses.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
      <label>Event<select value={event} onChange={(e) => { setPage(1); setEvent(e.target.value); }}><option value="all">All events</option>{events.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
      <label className="repo-runs-branch">Branch<input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main, feature/…" /></label>
      <button className="secondary-button" type="submit">Apply branch</button>
      {(branchFilter || status !== "all" || event !== "all") && <button className="repo-runs-clear" type="button" onClick={() => { setBranch(""); setBranchFilter(""); setStatus("all"); setEvent("all"); setPage(1); }}>Clear filters</button>}
    </form>
    {error && <div className="inspector-error">{error}</div>}
    {loading && <div className="repo-runs-state"><span className="inspector-spinner" /> Loading this repository's workflow runs…</div>}
    {!loading && !error && data && data.items.length === 0 && <div className="repo-runs-state">No runs matched these filters. Try clearing the filters or checking another branch.</div>}
    {!loading && !error && data && data.items.length > 0 && <div className="repo-runs-list">
      {data.items.map((run) => <article className={"repo-run-row" + (selectedId === run.id ? " selected" : "")} key={run.id}>
        <button className="repo-run-main" type="button" onClick={() => setSelectedId((current) => current === run.id ? null : run.id)} aria-expanded={selectedId === run.id}>
          <span className={"repo-run-state-icon " + (statusClass(run.status, run.conclusion).split(" ")[1] || "")}>{run.conclusion === "success" ? "✓" : ["failure", "timed_out", "action_required"].includes(run.conclusion || "") ? "×" : run.status === "in_progress" ? "◌" : "·"}</span>
          <span className="repo-run-main-copy"><strong>{run.title || run.name}</strong><small>{run.name} · #{run.runNumber} · attempt {run.attempt} · {run.branch || "branch unavailable"}</small><small>{run.event} · by {run.actor} · {ago(run.createdAt)}</small></span>
          <span className={statusClass(run.status, run.conclusion)}>{pretty(run.conclusion || run.status)}</span>
          <span className="repo-run-chevron">{selectedId === run.id ? "−" : "+"}</span>
        </button>
        {selectedId === run.id && <div className="repo-run-expanded">
          {detailLoading && <div className="repo-runs-state">Loading job and step details…</div>}
          {detailError && <div className="inspector-error">{detailError}</div>}
          {detail && detail.run.id === run.id && <>
            <div className="repo-run-meta-grid">
              <div><span>Workflow file</span><strong>{detail.run.workflowPath}</strong></div>
              <div><span>Branch</span><strong>{detail.run.branch}</strong></div>
              <div><span>Event</span><strong>{detail.run.event}</strong></div>
              <div><span>Duration</span><strong>{duration(detail.run.startedAt, detail.run.updatedAt)}</strong></div>
              <div><span>Started</span><strong>{detail.run.startedAt ? new Date(detail.run.startedAt).toLocaleString() : "Not recorded"}</strong></div>
              <div><span>Last updated</span><strong>{new Date(detail.run.updatedAt).toLocaleString()}</strong></div>
              <div><span>Triggered by</span><strong>{detail.run.triggeredBy || detail.run.actor}</strong></div>
              <div><span>Commit</span><strong><a href={detail.run.commitUrl} target="_blank" rel="noreferrer">{detail.run.commitSha.slice(0, 12)}</a></strong></div>
            </div>
            {detail.run.commitMessage && <div className="repo-run-commit"><span>Commit message</span><p>{detail.run.commitMessage}</p></div>}
            {detail.run.pullRequests.length > 0 && <div className="repo-run-pr-links"><span>Linked pull requests</span>{detail.run.pullRequests.map((pr) => <a key={pr.number} href={pr.url} target="_blank" rel="noreferrer">#{pr.number} {pr.head || ""} → {pr.base || ""}</a>)}</div>}
            <div className="repo-run-detail-heading"><strong>Jobs and steps</strong><span>{detail.jobs.total === null ? "Unavailable" : detail.jobs.total + " jobs"}</span></div>
            {!detail.jobs.available && <p className="repo-run-muted">GitHub did not expose job details for this run.</p>}
            {detail.jobs.items.map((job) => <div className="repo-job" key={job.id}>
              <div className="repo-job-heading"><div><strong>{job.name}</strong><small>{job.runner || "Runner not reported"} · {duration(job.startedAt, job.completedAt)}</small></div><span className={statusClass(job.status, job.conclusion)}>{pretty(job.conclusion || job.status)}</span></div>
              {job.steps.length > 0 && <div className="repo-steps">{job.steps.map((step) => <div className="repo-step" key={step.number}><span className={"repo-step-mark " + (statusClass(step.status, step.conclusion).split(" ")[1] || "")}>{step.conclusion === "success" ? "✓" : step.conclusion === "failure" ? "×" : "·"}</span><span>{step.number}. {step.name}</span><span className={statusClass(step.status, step.conclusion)}>{pretty(step.conclusion || step.status)}</span><small>{duration(step.startedAt, step.completedAt)}</small></div>)}</div>}
            </div>)}
            <div className="repo-run-detail-heading"><strong>Artifacts</strong><span>{detail.artifacts.total === null ? "Unavailable" : detail.artifacts.total + " artifacts"}</span></div>
            {!detail.artifacts.available && <p className="repo-run-muted">Artifact metadata was unavailable or the run has no accessible artifacts.</p>}
            {detail.artifacts.items.length > 0 && <div className="repo-artifacts">{detail.artifacts.items.map((artifact) => <div key={artifact.id}><span>▧</span><div><strong>{artifact.name}</strong><small>{bytes(artifact.sizeBytes)} · {artifact.expired ? "Expired" : "Available"} · expires {ago(artifact.expiresAt)}</small></div></div>)}</div>}
            <div className="repo-run-footer"><span>{detail.meta.note}</span><a href={detail.run.url} target="_blank" rel="noreferrer">Open full run on GitHub ↗</a></div>
          </>}
        </div>}
      </article>)}
    </div>}
    {!loading && !error && data && <div className="repo-runs-pagination"><span>Page {data.page} of {Math.max(1, data.pageCount)} · showing {data.items.length} runs</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Previous</button><button className="secondary-button" disabled={page >= data.pageCount || data.items.length === 0} onClick={() => setPage((p) => p + 1)}>Next →</button></div></div>}
    <p className="repo-runs-disclaimer">“All runs” means every page GitHub exposes for the selected repository and current filters. GitHub can restrict visibility, pagination, logs, or older data. No run or step is treated as successful when its status is missing.</p>
  </section>;
}
