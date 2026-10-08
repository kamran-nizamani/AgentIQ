import { useMemo, useState } from "react";

type IconName =
  | "grid" | "activity" | "git" | "bar" | "shield" | "settings"
  | "search" | "bell" | "plus" | "arrow" | "check" | "clock"
  | "alert" | "trend" | "chevron" | "spark" | "menu";

const icons: Record<IconName, string> = {
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
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

const nav = [
  { label: "Overview", icon: "grid" as const },
  { label: "Runs", icon: "activity" as const },
  { label: "Repositories", icon: "git" as const },
  { label: "Benchmarks", icon: "bar" as const },
  { label: "Audit & Safety", icon: "shield" as const },
];

const runs = [
  { id: "run_8F2A", repo: "AgentIQ", agent: "Claude Code", task: "Add CI evidence collector", score: 94, status: "Success", time: "8m 24s", ago: "12 min ago" },
  { id: "run_7C91", repo: "RepoPilot", agent: "Codex", task: "Fix PR patch parser", score: 87, status: "Success", time: "11m 02s", ago: "38 min ago" },
  { id: "run_6D14", repo: "AgentIQ", agent: "Claude Code", task: "Normalize review events", score: 78, status: "Partial", time: "14m 47s", ago: "1h ago" },
  { id: "run_5A82", repo: "Dashboard", agent: "Codex", task: "Repair Supabase auth flow", score: 61, status: "Failed", time: "6m 31s", ago: "2h ago" },
];

function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return (
    <div className="score-ring" aria-label={`${score} out of 100`}>
      <svg viewBox="0 0 72 72">
        <circle className="ring-track" cx="36" cy="36" r={radius} />
        <circle className="ring-value" cx="36" cy="36" r={radius} strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <strong>{score}</strong>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 30 - ((value - min) / Math.max(max - min, 1)) * 24;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function App() {
  const [active, setActive] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("30d");

  const filteredRuns = useMemo(
    () => runs.filter((run) => [run.repo, run.agent, run.task, run.status].join(" ").toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Icon name="spark" size={17} /></div>
          <div><strong>AgentIQ</strong><span>Agent intelligence</span></div>
        </div>

        <div className="workspace">
          <span className="workspace-dot" />
          <div><small>Workspace</small><strong>Personal</strong></div>
          <Icon name="chevron" size={15} />
        </div>

        <nav className="nav-list">
          <p className="nav-label">Monitor</p>
          {nav.map((item) => (
            <button key={item.label} className={`nav-item ${active === item.label ? "active" : ""}`} onClick={() => { setActive(item.label); setSidebarOpen(false); }}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.label === "Runs" && <em>24</em>}
            </button>
          ))}
          <p className="nav-label nav-label-spaced">System</p>
          <button className={`nav-item ${active === "Settings" ? "active" : ""}`} onClick={() => setActive("Settings")}><Icon name="settings" /><span>Settings</span></button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-line"><span className="pulse" /> All systems operational</div>
          <div className="user-card">
            <div className="avatar">K</div>
            <div><strong>Kamran</strong><span>Developer</span></div>
            <Icon name="chevron" size={15} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>AgentIQ</span><b>/</b><strong>{active}</strong></div>
          <div className="top-actions">
            <label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs, repos..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button" aria-label="Notifications"><Icon name="bell" size={18} /><span className="notification-dot" /></button>
            <button className="primary-button"><Icon name="plus" size={17} /> New evaluation</button>
          </div>
        </header>

        <div className="content">
          <section className="hero">
            <div>
              <p className="eyebrow"><span className="live-dot" /> Evidence pipeline active</p>
              <h1>Good morning, Kamran.</h1>
              <p className="hero-copy">Measure what your coding agents actually ship — with evidence you can audit.</p>
            </div>
            <div className="hero-actions">
              <button className="secondary-button">View reports <Icon name="arrow" size={16} /></button>
            </div>
          </section>

          <section className="metrics-grid">
            <Metric title="Average score" value="86.4" suffix="/100" delta="+8.2%" icon="trend" values={[69,72,71,77,76,82,80,86,84,86]} />
            <Metric title="Success rate" value="91.8" suffix="%" delta="+4.6%" icon="check" values={[82,85,83,88,87,89,88,91,90,92]} />
            <Metric title="Runs evaluated" value="128" suffix="" delta="+24 this month" icon="activity" values={[44,52,57,61,72,78,81,96,111,128]} />
            <Metric title="Safety incidents" value="3" suffix="" delta="-40% vs last month" icon="shield" values={[8,7,7,6,5,5,4,5,3,3]} warning />
          </section>

          <section className="dashboard-grid">
            <div className="panel performance-panel">
              <div className="panel-head">
                <div><h2>Agent performance</h2><p>Score and reliability over the last 30 days</p></div>
                <div className="segmented">{["7d","30d","90d"].map((item) => <button key={item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div>
              </div>
              <div className="chart">
                <div className="chart-y"><span>100</span><span>80</span><span>60</span><span>40</span></div>
                <div className="chart-area">
                  {[0,1,2,3].map((line) => <div className="grid-line" style={{ top: `${line * 33.3}%` }} key={line} />)}
                  <div className="chart-bars">{[74,81,77,86,83,89,87,92,88,94,91,96].map((v, i) => <div className="bar-wrap" key={i}><div className="chart-bar" style={{ height: `${v}%` }} /><span>{i % 2 === 0 ? ["Sep 12","Sep 16","Sep 20","Sep 24","Sep 28","Oct 02"][i/2] : ""}</span></div>)}</div>
                </div>
              </div>
              <div className="chart-legend"><span><i className="legend-score" /> Average score</span><span><i className="legend-target" /> Target 85</span></div>
            </div>

            <div className="panel breakdown-panel">
              <div className="panel-head"><div><h2>Score breakdown</h2><p>Current evaluation policy</p></div><button className="more-button">•••</button></div>
              <div className="breakdown-score"><ScoreRing score={86} /><div><strong>Strong performance</strong><span>+8.2 points this month</span></div></div>
              <div className="breakdown-list">
                <Breakdown label="Outcome" score={94} weight="35%" />
                <Breakdown label="Tests" score={91} weight="30%" />
                <Breakdown label="Efficiency" score={79} weight="15%" />
                <Breakdown label="Autonomy" score={82} weight="10%" />
                <Breakdown label="Safety" score={96} weight="10%" />
              </div>
            </div>
          </section>

          <section className="panel runs-panel">
            <div className="panel-head runs-head">
              <div><h2>Recent evaluations</h2><p>Latest agent runs across connected repositories</p></div>
              <button className="text-button">View all <Icon name="arrow" size={15} /></button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Run</th><th>Repository</th><th>Agent</th><th>Task</th><th>Score</th><th>Status</th><th>Duration</th><th> </th></tr></thead>
                <tbody>
                  {filteredRuns.map((run) => (
                    <tr key={run.id}>
                      <td><span className="run-id">{run.id}</span><small>{run.ago}</small></td>
                      <td><span className="repo-cell"><span className="repo-icon"><Icon name="git" size={14} /></span>{run.repo}</span></td>
                      <td><span className="agent-name">{run.agent}</span></td>
                      <td><span className="task-cell">{run.task}</span></td>
                      <td><strong className={run.score >= 85 ? "score-good" : run.score >= 70 ? "score-mid" : "score-bad"}>{run.score}</strong></td>
                      <td><Status status={run.status} /></td>
                      <td><span className="duration"><Icon name="clock" size={14} />{run.time}</span></td>
                      <td><button className="row-arrow" aria-label={`Open ${run.id}`}><Icon name="arrow" size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRuns.length === 0 && <div className="empty">No evaluations match “{query}”.</div>}
            </div>
          </section>

          <section className="bottom-grid">
            <div className="panel insight-card">
              <div className="insight-icon"><Icon name="spark" size={19} /></div>
              <div><span className="card-kicker">AgentIQ insight</span><h3>Tests are your biggest scoring lever</h3><p>Runs with complete test evidence average <strong>11.4 points higher</strong> than runs without it.</p><button className="text-button">Explore evidence <Icon name="arrow" size={15} /></button></div>
            </div>
            <div className="panel alert-card">
              <div className="alert-icon"><Icon name="alert" size={19} /></div>
              <div><span className="card-kicker">Needs attention</span><h3>3 safety signals detected</h3><p>Two dependency changes and one sensitive configuration change need review.</p><button className="text-button">Open audit <Icon name="arrow" size={15} /></button></div>
            </div>
          </section>

          <footer className="footer"><span>AgentIQ v0.1 · Evidence before opinion.</span><span><span className="footer-dot" /> API connected · Last sync 2 min ago</span></footer>
        </div>
      </main>
    </div>
  );
}

function Metric({ title, value, suffix, delta, icon, values, warning = false }: { title: string; value: string; suffix: string; delta: string; icon: IconName; values: number[]; warning?: boolean }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{title}</span><div className={`metric-icon ${warning ? "warning" : ""}`}><Icon name={icon} size={17} /></div></div>
      <div className="metric-value">{value}<small>{suffix}</small></div>
      <div className="metric-bottom"><span className={delta.startsWith("-") ? "positive" : "positive"}>{delta}</span><Sparkline values={values} /></div>
    </div>
  );
}

function Breakdown({ label, score, weight }: { label: string; score: number; weight: string }) {
  return <div className="breakdown-row"><span>{label}<small>{weight} weight</small></span><div className="progress"><i style={{ width: `${score}%` }} /></div><strong>{score}</strong></div>;
}

function Status({ status }: { status: string }) {
  const cls = status === "Success" ? "success" : status === "Partial" ? "partial" : "failed";
  return <span className={`status ${cls}`}><i />{status}</span>;
}

export default App;
