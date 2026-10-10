import { useEffect, useMemo, useState, type ReactNode } from "react";

type IconName = "grid" | "activity" | "git" | "bar" | "shield" | "settings" | "search" | "bell" | "plus" | "arrow" | "check" | "clock" | "alert" | "trend" | "chevron" | "spark" | "menu" | "refresh" | "close" | "external";
const iconPaths: Record<IconName, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  activity: "M3 12h4l2-7 4 14 2-7h6",
  git: "M7 7v10m0-10a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm10 10V7m0 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM7 7h10",
  bar: "M5 20V10m7 10V4m7 16v-7",
  shield: "M12 3 20 6v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3Z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h13m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  alert: "M12 9v4m0 4h.01M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  trend: "m4 16 5-5 4 3 7-8M15 6h5v5",
  chevron: "m8 10 4 4 4-4",
  spark: "M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  refresh: "M20 7v5h-5M4 17v-5h5m-3.2-3A7 7 0 0 1 18.5 7L20 12M4 12l1.5 5A7 7 0 0 0 18.2 15",
  close: "M18 6 6 18M6 6l12 12",
  external: "M14 3h7v7m0-7L10 14M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6",
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}

const navigation = [
  { label: "Overview", icon: "grid" as const },
  { label: "Runs", icon: "activity" as const },
  { label: "Repositories", icon: "git" as const },
  { label: "Benchmarks", icon: "bar" as const },
  { label: "Audit & Safety", icon: "shield" as const },
  { label: "Settings", icon: "settings" as const },
];

type Breakdown = { outcome: number; tests: number; efficiency: number; autonomy: number; safety: number };
type RunRow = {
  runId: string;
  repository: string;
  score: number;
  grade: string;
  outcome: "success" | "partial" | "failure";
  storedAt: string;
  evidenceCount: number;
  riskCount: number;
  agent: string;
  task: string;
  durationMs: number;
  url: string;
  branch: string;
  commitSha: string;
  workflow: string;
  event: string;
  status: string;
  conclusion: string | null;
  runNumber: number;
  tests: { total: number; passed: number; failed: number };
  changes: { filesChanged: number; linesAdded: number; linesDeleted: number };
  breakdown: Breakdown;
  recommendations: string[];
  evidenceKinds: string[];
  testEvidenceAvailable: boolean;
  diffEvidenceAvailable: boolean;
  riskAssessment: "not-assessed" | "assessed";
};
type ApiMeta = { source: string; repository: string; authenticated: boolean; generatedAt: string; note: string; storage?: "supabase" | "github-live" | "unavailable" };
type RunsResponse = { data: RunRow[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean }; meta: ApiMeta };
type EvidenceItem = { id: string; kind: string; timestamp: string; provenance: { source: string; sourceId: string; collectedAt: string }; data: Record<string, unknown> };
type RunDetail = RunRow & { evidence: { schemaVersion: string; evidence: EvidenceItem[] }; evaluation: { evaluation: { score: number; grade: string; breakdown: Breakdown; recommendations: string[] }; policy: { id: string }; riskSignals: Array<{ type?: string; category?: string; severity?: string; message?: string }> }; jobs: Array<{ id: number; name: string; status: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null; html_url?: string }> };

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  return Math.floor(total / 60) + "m " + String(total % 60).padStart(2, "0") + "s";
}
function formatAgo(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  if (minutes < 1440) return Math.floor(minutes / 60) + "h ago";
  return Math.floor(minutes / 1440) + "d ago";
}
function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function displayScore(value: number | null): string { return value === null ? "—" : value.toFixed(1); }
function outcomeLabel(outcome: RunRow["outcome"]): string {
  return outcome === "success" ? "Success" : outcome === "partial" ? "Partial" : "Failed";
}
function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return <div className="score-ring" aria-label={score + " out of 100"}><svg viewBox="0 0 72 72"><circle className="ring-track" cx="36" cy="36" r={radius} /><circle className="ring-value" cx="36" cy="36" r={radius} strokeDasharray={dash + " " + (circumference - dash)} /></svg><strong>{score}</strong></div>;
}
function Sparkline({ values }: { values: number[] }) {
  const data = values.length ? values : [0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const points = data.map((value, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 30 - ((value - min) / Math.max(max - min, 1)) * 24;
    return x + "," + y;
  }).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Metric({ title, value, suffix = "", note, icon, values, warning = false }: { title: string; value: string; suffix?: string; note: string; icon: IconName; values: number[]; warning?: boolean }) {
  return <div className="metric-card"><div className="metric-top"><span>{title}</span><div className={"metric-icon" + (warning ? " warning" : "")}><Icon name={icon} size={17} /></div></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-bottom"><span>{note}</span><Sparkline values={values} /></div></div>;
}
function Breakdown({ label, score, weight }: { label: string; score: number | null; weight: string }) {
  return <div className="breakdown-row"><span>{label}<small>{weight} weight</small></span><div className="progress"><i style={{ width: (score ?? 0) + "%" }} /></div><strong>{score === null ? "—" : Math.round(score)}</strong></div>;
}
function Status({ status }: { status: string }) {
  const cls = status === "Success" ? "success" : status === "Partial" || status === "In progress" ? "partial" : "failed";
  return <span className={"status " + cls}><i />{status}</span>;
}
function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty"><strong>{title}</strong><p>{description}</p></div>;
}
function RunsTable({ runs, loading, error, onSelect, compact = false }: { runs: RunRow[]; loading: boolean; error: string; onSelect: (id: string) => void; compact?: boolean }) {
  const shown = compact ? runs.slice(0, 8) : runs;
  return <div className="table-wrap"><table><thead><tr><th>Workflow run</th><th>Repository</th><th>Workflow</th><th>Score</th><th>Outcome</th><th>Duration</th><th></th></tr></thead><tbody>{shown.map((run) => <tr key={run.runId}><td><span className="run-id">#{run.runNumber} · {run.runId}</span><small>{formatAgo(run.storedAt)}</small></td><td><span className="repo-cell"><span className="repo-icon"><Icon name="git" size={14} /></span>{run.repository}</span></td><td><span className="task-cell">{run.workflow}</span></td><td><strong className={run.score >= 85 ? "score-good" : run.score >= 70 ? "score-mid" : "score-bad"}>{run.score}</strong><small>Grade {run.grade}</small></td><td><Status status={outcomeLabel(run.outcome)} /></td><td><span className="duration"><Icon name="clock" size={14} />{formatDuration(run.durationMs)}</span></td><td><button className="row-arrow" aria-label={"Open run " + run.runId} onClick={() => onSelect(run.runId)}><Icon name="arrow" size={15} /></button></td></tr>)}</tbody></table>{loading && <EmptyState title="Loading live workflow runs…" description="Fetching the latest evidence from GitHub Actions." />}{!loading && error && <EmptyState title="Live data could not be loaded" description={error} />}{!loading && !error && shown.length === 0 && <EmptyState title="No workflow runs found" description="This repository has no visible Actions runs for the configured query." />}</div>;
}

function App() {
  const [active, setActive] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("30d");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [health, setHealth] = useState<{ status: string; repository: string; authenticatedGitHub: boolean; storage: string; durableStorageConfigured?: boolean } | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadingRuns(true);
      setRunsError("");
      try {
        const response = await fetch("/api/runs?limit=100&offset=0", { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || "GitHub Actions request failed (" + response.status + ").");
        const payload = body as RunsResponse;
        setRuns(payload.data);
        setTotalRuns(payload.pagination.total);
        setMeta(payload.meta);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRunsError(error instanceof Error ? error.message : "Unable to load live workflow history.");
      } finally {
        if (!controller.signal.aborted) setLoadingRuns(false);
      }
    }
    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (response.ok) setHealth(body.data);
      } catch { /* The run endpoint displays the actionable error state. */ }
    }
    void load();
    void loadHealth();
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null);
      setDetailError("");
      return;
    }
    const runId = selectedRunId;
    const controller = new AbortController();
    async function loadDetail() {
      setDetailLoading(true);
      setDetailError("");
      try {
        const response = await fetch("/api/runs/" + encodeURIComponent(runId), { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || "Unable to load run details.");
        setSelectedRun(body.data as RunDetail);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error ? error.message : "Unable to load run details.");
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [selectedRunId]);

  const visibleRuns = useMemo(() => {
    const cutoff = Date.now() - (range === "7d" ? 7 : range === "90d" ? 90 : 30) * 24 * 60 * 60 * 1000;
    return runs.filter((run) => {
      const matchesQuery = [run.repository, run.agent, run.task, run.workflow, run.status, run.outcome, run.branch, run.runId].join(" ").toLowerCase().includes(query.toLowerCase());
      const timestamp = Date.parse(run.storedAt);
      return matchesQuery && (!Number.isFinite(timestamp) || timestamp >= cutoff);
    });
  }, [runs, query, range]);

  const averageScore = average(visibleRuns.map((run) => run.score));
  const successRate = visibleRuns.length ? (visibleRuns.filter((run) => run.outcome === "success").length / visibleRuns.length) * 100 : null;
  const scoreValues = visibleRuns.slice(0, 12).map((run) => run.score);
  const averageBreakdown = {
    outcome: average(visibleRuns.map((run) => run.breakdown.outcome)),
    tests: average(visibleRuns.map((run) => run.breakdown.tests)),
    efficiency: average(visibleRuns.map((run) => run.breakdown.efficiency)),
    autonomy: average(visibleRuns.map((run) => run.breakdown.autonomy)),
    safety: average(visibleRuns.map((run) => run.breakdown.safety)),
  };
  const workflows = useMemo(() => {
    const groups = new Map<string, RunRow[]>();
    for (const run of visibleRuns) groups.set(run.workflow, [...(groups.get(run.workflow) || []), run]);
    return [...groups.entries()].map(([name, rows]) => ({
      name,
      count: rows.length,
      average: average(rows.map((run) => run.score)) || 0,
      successRate: rows.length ? (rows.filter((run) => run.outcome === "success").length / rows.length) * 100 : 0,
      failures: rows.filter((run) => run.outcome === "failure").length,
    })).sort((a, b) => b.count - a.count);
  }, [visibleRuns]);

  const navigate = (label: string) => { setActive(label); setSidebarOpen(false); setSelectedRunId(null); };
  const refresh = () => setRefreshKey((value) => value + 1);

  return <div className="app-shell">
    <aside className={"sidebar" + (sidebarOpen ? " sidebar-open" : "")}>
      <div className="brand"><div className="brand-mark"><Icon name="spark" size={17} /></div><div><strong>AgentIQ</strong><span>Evidence-driven evaluation</span></div></div>
      <div className="workspace"><span className="workspace-dot" /><div><small>Data source</small><strong>{meta?.repository || "Connecting to GitHub…"}</strong></div><Icon name="chevron" size={15} /></div>
      <nav className="nav-list"><p className="nav-label">Monitor</p>{navigation.slice(0, 5).map((item) => <button key={item.label} className={"nav-item" + (active === item.label ? " active" : "")} onClick={() => navigate(item.label)}><Icon name={item.icon} /><span>{item.label}</span>{item.label === "Runs" && <em>{totalRuns}</em>}</button>)}<p className="nav-label nav-label-spaced">System</p>{navigation.slice(5).map((item) => <button key={item.label} className={"nav-item" + (active === item.label ? " active" : "")} onClick={() => navigate(item.label)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className="status-line"><span className="pulse" /> {runsError ? "Data source needs attention" : loadingRuns ? "Connecting to live data" : "GitHub API connected"}</div><div className="user-card"><div className="avatar">K</div><div><strong>Workspace owner</strong><span>Developer</span></div><Icon name="chevron" size={15} /></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle navigation"><Icon name="menu" /></button><div className="breadcrumbs"><span>AgentIQ</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows, branches…" /><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Refresh live data" title="Refresh live data" onClick={refresh}><Icon name="refresh" size={17} /></button><button className="primary-button" onClick={refresh} disabled={loadingRuns}><Icon name="refresh" size={16} /> Refresh data</button></div></header>

      <div className="content">
        <section className="hero"><div><p className="eyebrow"><span className="live-dot" /> {loadingRuns ? "Loading GitHub Actions evidence" : runsError ? "Live source unavailable" : "Live GitHub Actions data"}</p><h1>{active === "Overview" ? "Engineering evidence, not guesswork." : active}</h1><p className="hero-copy">{active === "Overview" ? "Evaluate real workflow outcomes and inspect the evidence behind every score." : "This view is calculated from the live workflow data currently available to AgentIQ."}</p></div><div className="hero-actions"><button className="secondary-button" onClick={() => navigate("Audit & Safety")}>Evidence coverage <Icon name="arrow" size={16} /></button></div></section>

        {selectedRunId && <section className="panel detail-panel">
          <PanelHeading title={selectedRun ? "Workflow run #" + selectedRun.runNumber : "Workflow run details"} subtitle={selectedRun ? selectedRun.workflow + " · " + selectedRun.repository : "Fetching run metadata, jobs, and step evidence"} action={<button className="more-button" aria-label="Close run details" onClick={() => setSelectedRunId(null)}><Icon name="close" size={16} /></button>} />
          {detailLoading && <EmptyState title="Loading run evidence…" description="Requesting the workflow and job details from GitHub." />}
          {!detailLoading && detailError && <EmptyState title="Run details unavailable" description={detailError} />}
          {!detailLoading && selectedRun && <div className="detail-body">
            <div className="detail-summary"><ScoreRing score={selectedRun.score} /><div><strong>{selectedRun.score}/100 · Grade {selectedRun.grade}</strong><span><Status status={outcomeLabel(selectedRun.outcome)} /> · {formatDuration(selectedRun.durationMs)}</span><p>{selectedRun.task}</p><a href={selectedRun.url} target="_blank" rel="noreferrer">Open run in GitHub <Icon name="external" size={13} /></a></div></div>
            <div className="detail-grid"><div><small>Branch</small><strong>{selectedRun.branch || "Unknown"}</strong></div><div><small>Commit</small><strong>{selectedRun.commitSha.slice(0, 12) || "Unknown"}</strong></div><div><small>Test evidence</small><strong>{selectedRun.testEvidenceAvailable ? selectedRun.tests.total + " tests" : "Not connected"}</strong></div><div><small>Diff risk</small><strong>{selectedRun.diffEvidenceAvailable ? selectedRun.riskCount + " signals" : "Not assessed"}</strong></div></div>
            <h3 className="detail-section-title">Score breakdown</h3><div className="breakdown-list"><Breakdown label="Outcome" score={selectedRun.breakdown.outcome} weight="35%" /><Breakdown label="Tests" score={selectedRun.breakdown.tests} weight="30%" /><Breakdown label="Efficiency" score={selectedRun.breakdown.efficiency} weight="15%" /><Breakdown label="Autonomy" score={selectedRun.breakdown.autonomy} weight="10%" /><Breakdown label="Safety" score={selectedRun.breakdown.safety} weight="10%" /></div>
            {!selectedRun.testEvidenceAvailable && <p className="evidence-note"><Icon name="alert" size={15} /> The scoring model uses its documented neutral test score because this workflow does not expose a parsed test report. This is not a claim that tests passed.</p>}
            {!selectedRun.diffEvidenceAvailable && <p className="evidence-note"><Icon name="shield" size={15} /> Code-diff and sensitive-path evidence are not connected for this run. Safety risk is not assessed; zero detected signals must not be interpreted as safe.</p>}
            <h3 className="detail-section-title">Evidence collected ({selectedRun.evidence.evidence.length})</h3><div className="evidence-list">{selectedRun.evidence.evidence.map((item) => <div key={item.id}><span>{item.kind}</span><small>{item.provenance.sourceId} · {formatAgo(item.timestamp)}</small></div>)}</div>
            {selectedRun.evaluation.riskSignals.length > 0 && <><h3 className="detail-section-title">Detected risk signals ({selectedRun.evaluation.riskSignals.length})</h3><div className="evidence-list">{selectedRun.evaluation.riskSignals.map((signal, index) => <div key={(signal.category || signal.type || "risk") + "-" + signal.message + "-" + index}><span>{(signal.severity || "medium").toUpperCase()} · {signal.category || signal.type || "risk"}</span><small>{signal.message || "Review the underlying evidence."}</small></div>)}</div></>}
            {selectedRun.evidence.evidence.filter((item) => item.kind === "diff").map((item) => {
              const changedFiles = Array.isArray(item.data.changedFiles) ? item.data.changedFiles as Array<{ path?: string; status?: string; additions?: number; deletions?: number }> : [];
              const dependencies = Array.isArray(item.data.dependencyFiles) ? item.data.dependencyFiles.filter((path): path is string => typeof path === "string") : [];
              const sensitive = Array.isArray(item.data.sensitiveFiles) ? item.data.sensitiveFiles as Array<{ path?: string; severity?: string }> : [];
              return <div key={item.id}><h3 className="detail-section-title">Commit diff evidence</h3><p className="evidence-note">Observed {String(item.data.filesChanged ?? changedFiles.length)} changed files · +{String(item.data.linesAdded ?? 0)} / −{String(item.data.linesDeleted ?? 0)} lines{item.data.fileListTruncated ? " · GitHub limited the returned file list; path analysis may be incomplete." : ""}</p>{changedFiles.length > 0 && <div className="evidence-list">{changedFiles.slice(0, 20).map((file, index) => <div key={(file.path || "file") + "-" + index}><span>{file.path || "Unknown path"} · {file.status || "modified"}</span><small>+{file.additions ?? 0} / −{file.deletions ?? 0}</small></div>)}</div>}{dependencies.length > 0 && <p className="evidence-note">Dependency files changed: {dependencies.join(", ")}</p>}{sensitive.length > 0 && <p className="evidence-note">Sensitive paths detected: {sensitive.map((file) => (file.path || "Unknown path") + " (" + (file.severity || "review") + ")").join(", ")}</p>}</div>;
            })}
            {selectedRun.jobs.length > 0 && <><h3 className="detail-section-title">Jobs and steps</h3><div className="evidence-list">{selectedRun.jobs.map((job) => <div key={job.id}><span>{job.name} · {job.conclusion || job.status}</span><small>{job.started_at ? formatAgo(job.started_at) : "Start time unavailable"} · {job.completed_at ? "completed" : job.status}</small></div>)}</div></>}
            {selectedRun.recommendations.length > 0 && <><h3 className="detail-section-title">Recommendations</h3><ul className="recommendations">{selectedRun.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></>}
          </div>}
        </section>}

        {active === "Overview" && <>
          <section className="metrics-grid"><Metric title="Average score" value={displayScore(averageScore)} suffix="/100" note={visibleRuns.length ? "Latest " + visibleRuns.length + " matching runs" : "No matching runs yet"} icon="trend" values={scoreValues} /><Metric title="Workflow success rate" value={successRate === null ? "—" : successRate.toFixed(1)} suffix="%" note={visibleRuns.length ? visibleRuns.filter((run) => run.outcome === "success").length + " successful runs" : "No workflow evidence"} icon="check" values={visibleRuns.map((run) => run.outcome === "success" ? 100 : 0)} /><Metric title="GitHub Actions runs" value={String(totalRuns)} note="Total runs reported by GitHub" icon="activity" values={visibleRuns.map((run) => run.score)} /><Metric title="Risk assessment" value={visibleRuns.some((run) => run.diffEvidenceAvailable) ? String(visibleRuns.filter((run) => run.riskCount > 0).length) : "N/A"} note={visibleRuns.some((run) => run.diffEvidenceAvailable) ? "Runs with recorded risk signals" : "Diff evidence is not connected"} icon="shield" values={visibleRuns.map((run) => run.riskCount)} warning={!visibleRuns.some((run) => run.diffEvidenceAvailable)} /></section>
          <section className="dashboard-grid"><div className="panel performance-panel"><PanelHeading title="Workflow score history" subtitle={"Scores calculated from the latest " + visibleRuns.length + " matching workflow runs"} action={<div className="segmented">{["7d","30d","90d"].map((item) => <button key={item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div>} /><div className="chart"><div className="chart-y"><span>100</span><span>80</span><span>60</span><span>40</span></div><div className="chart-area">{[0,1,2,3].map((line) => <div className="grid-line" style={{ top: (line * 33.3) + "%" }} key={line} />)}<div className="chart-bars">{visibleRuns.slice(0, 12).reverse().map((run) => <div className="bar-wrap" key={run.runId} title={run.workflow + ": " + run.score}><div className="chart-bar" style={{ height: Math.max(4, run.score) + "%" }} /><span>#{run.runNumber}</span></div>)}</div></div></div><div className="chart-legend"><span><i className="legend-score" /> Evidence-based score</span><span>{meta?.source || "GitHub Actions"}</span></div>{!loadingRuns && !runsError && visibleRuns.length === 0 && <EmptyState title="No chart data" description="Runs will appear after GitHub reports workflow activity." />}</div>
          <div className="panel breakdown-panel"><PanelHeading title="Average score breakdown" subtitle="The documented deterministic scoring policy" /><div className="breakdown-score"><ScoreRing score={Math.round(averageScore || 0)} /><div><strong>{averageScore === null ? "Waiting for evidence" : averageScore >= 80 ? "Strong workflow outcomes" : averageScore >= 60 ? "Mixed workflow outcomes" : "Needs investigation"}</strong><span>Calculated from visible workflow runs</span></div></div><div className="breakdown-list"><Breakdown label="Outcome" score={averageBreakdown.outcome} weight="35%" /><Breakdown label="Tests" score={averageBreakdown.tests} weight="30%" /><Breakdown label="Efficiency" score={averageBreakdown.efficiency} weight="15%" /><Breakdown label="Autonomy" score={averageBreakdown.autonomy} weight="10%" /><Breakdown label="Safety" score={averageBreakdown.safety} weight="10%" /></div><p className="evidence-note"><Icon name="alert" size={15} /> Test and safety scores can be provisional when test reports and code diffs are absent. Open a run to see evidence coverage.</p></div></section>
          <section className="panel runs-panel"><PanelHeading title="Recent workflow evaluations" subtitle="Real GitHub Actions runs, refreshed from the configured repository" action={<button className="text-button" onClick={() => navigate("Runs")}>View all <Icon name="arrow" size={15} /></button>} /><RunsTable runs={visibleRuns} loading={loadingRuns} error={runsError} onSelect={setSelectedRunId} compact /></section>
        </>}

        {active === "Runs" && <section className="panel runs-panel"><PanelHeading title="Workflow run history" subtitle={totalRuns + " runs reported by GitHub · search and date range filters apply"} action={<div className="segmented">{["7d","30d","90d"].map((item) => <button key={item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div>} /><RunsTable runs={visibleRuns} loading={loadingRuns} error={runsError} onSelect={setSelectedRunId} /></section>}

        {active === "Repositories" && <section className="panel"><PanelHeading title="Connected repository" subtitle="The production API reads Actions history from this configured repository." /><div className="repository-card"><div className="repo-icon large"><Icon name="git" size={22} /></div><div className="repository-main"><strong>{meta?.repository || health?.repository || "Repository configuration unavailable"}</strong><span>{health?.status === "ok" ? "API healthy" : "Health status unavailable"} · {meta?.authenticated ? "Authenticated GitHub API" : "Public GitHub API"}</span><p>Latest branch: {visibleRuns[0]?.branch || "No branch evidence"} · {totalRuns} total workflow runs</p></div><a className="secondary-button" href={"https://github.com/" + (meta?.repository || health?.repository || "kamran-nizamani/AgentIQ")} target="_blank" rel="noreferrer">Open repository <Icon name="external" size={14} /></a></div><div className="detail-grid"><div><small>Workflows observed</small><strong>{workflows.length}</strong></div><div><small>Runs in current range</small><strong>{visibleRuns.length}</strong></div><div><small>Test evidence coverage</small><strong>{visibleRuns.length ? Math.round(visibleRuns.filter((run) => run.testEvidenceAvailable).length / visibleRuns.length * 100) : 0}%</strong></div><div><small>Diff evidence coverage</small><strong>{visibleRuns.length ? Math.round(visibleRuns.filter((run) => run.diffEvidenceAvailable).length / visibleRuns.length * 100) : 0}%</strong></div></div><p className="evidence-note"><Icon name="alert" size={15} /> Repository selection is environment-configured in this release. To connect another repository, set AGENTIQ_GITHUB_REPOSITORY in Vercel project settings; use a least-privilege GITHUB_TOKEN for private repositories.</p></section>}

        {active === "Benchmarks" && <section className="panel runs-panel"><PanelHeading title="Workflow performance comparison" subtitle="Compare actual workflows by recent outcome and deterministic score. This is not yet a controlled agent-vs-agent benchmark." /><div className="table-wrap"><table><thead><tr><th>Workflow</th><th>Runs</th><th>Average score</th><th>Success rate</th><th>Failures</th></tr></thead><tbody>{workflows.map((workflow) => <tr key={workflow.name}><td><strong className="agent-name">{workflow.name}</strong></td><td>{workflow.count}</td><td><strong className={workflow.average >= 85 ? "score-good" : workflow.average >= 70 ? "score-mid" : "score-bad"}>{workflow.average.toFixed(1)}</strong></td><td>{workflow.successRate.toFixed(1)}%</td><td>{workflow.failures}</td></tr>)}</tbody></table>{!loadingRuns && !runsError && workflows.length === 0 && <EmptyState title="No workflow data to compare" description="Workflow comparisons will appear when GitHub Actions runs are available." />}{runsError && <EmptyState title="Live comparison unavailable" description={runsError} />}</div></section>}

        {active === "Audit & Safety" && <><section className="metrics-grid"><Metric title="Failed workflows" value={String(visibleRuns.filter((run) => run.outcome === "failure").length)} note="Visible runs with failure outcomes" icon="alert" values={visibleRuns.map((run) => run.outcome === "failure" ? 100 : 0)} warning /><Metric title="Test evidence coverage" value={(visibleRuns.length ? Math.round(visibleRuns.filter((run) => run.testEvidenceAvailable).length / visibleRuns.length * 100) : 0) + "%"} note="Runs with parsed test evidence" icon="check" values={visibleRuns.map((run) => run.testEvidenceAvailable ? 100 : 0)} /><Metric title="Diff evidence coverage" value={(visibleRuns.length ? Math.round(visibleRuns.filter((run) => run.diffEvidenceAvailable).length / visibleRuns.length * 100) : 0) + "%"} note="Runs with code-change evidence" icon="git" values={visibleRuns.map((run) => run.diffEvidenceAvailable ? 100 : 0)} warning /><Metric title="Runs with risk signals" value={visibleRuns.some((run) => run.diffEvidenceAvailable) ? String(visibleRuns.filter((run) => run.riskCount > 0).length) : "N/A"} note="Only meaningful when risk evidence exists" icon="shield" values={visibleRuns.map((run) => run.riskCount)} warning={!visibleRuns.some((run) => run.diffEvidenceAvailable)} /></section><section className="panel"><PanelHeading title="Safety evidence coverage" subtitle="Absence of evidence is not evidence of safety." /><p className="evidence-note"><Icon name="alert" size={16} /> The run list uses lightweight workflow metadata. Opening a run also attempts to collect commit-level file and line changes, dependency-file changes, and sensitive-path signals. Test reports and rollback evidence are not yet ingested, and missing diff evidence remains not assessed rather than safe.</p><RunsTable runs={visibleRuns.filter((run) => run.outcome !== "success" || !run.diffEvidenceAvailable)} loading={loadingRuns} error={runsError} onSelect={setSelectedRunId} /></section></>}

        {active === "Settings" && <section className="panel settings-panel"><PanelHeading title="Data source settings" subtitle="Production configuration and integration health." /><div className="settings-row"><div><strong>Repository</strong><p>Configured by AGENTIQ_GITHUB_REPOSITORY on Vercel.</p></div><span>{meta?.repository || health?.repository || "Unavailable"}</span></div><div className="settings-row"><div><strong>GitHub API authentication</strong><p>Tokens are read only by the server; they are never sent to the browser.</p></div><Status status={meta?.authenticated ? "Success" : "Partial"} /></div><div className="settings-row"><div><strong>Live API</strong><p>Health endpoint: /api/health</p></div><Status status={health?.status === "ok" ? "Success" : "Partial"} /></div><div className="settings-row"><div><strong>Durable run history</strong><p>{health?.durableStorageConfigured ? "Supabase Postgres archive is configured for summaries and run-detail evidence." : "Live GitHub data is available, but durable history needs Supabase environment variables and the SQL migration."}</p></div><Status status={health?.durableStorageConfigured ? "Success" : "Partial"} /></div><div className="settings-row"><div><strong>Evidence limitations</strong><p>{meta?.note || "Test reports and code-diff evidence are not connected."}</p></div><button className="secondary-button" onClick={() => navigate("Audit & Safety")}>Review coverage <Icon name="arrow" size={14} /></button></div><div className="settings-actions"><button className="primary-button" onClick={refresh}><Icon name="refresh" size={15} /> Check connection again</button></div></section>}

        <footer className="footer"><span>AgentIQ · Evidence before opinion.</span><span><span className="footer-dot" /> {meta?.source || "GitHub Actions live source"} · {meta?.generatedAt ? "Updated " + formatAgo(meta.generatedAt) : "Waiting for source"}</span></footer>
      </div>
    </main>
  </div>;
}

export default App;
