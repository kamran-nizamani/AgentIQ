import type { IncomingMessage, ServerResponse } from "node:http";

type ApiFailure = { status: number; message: string };
type Run = {
  id: number; name: string; display_title?: string; html_url: string; workflow_url?: string;
  status: string; conclusion: string | null; created_at: string; updated_at: string;
  run_started_at?: string | null; run_number: number; run_attempt: number; event: string;
  head_branch: string; head_sha: string; path: string; actor?: { login?: string; html_url?: string };
  triggering_actor?: { login?: string; html_url?: string };
  head_commit?: { message?: string; timestamp?: string; author?: { name?: string; email?: string } };
  pull_requests?: Array<{ number: number; html_url: string; head?: { ref?: string }; base?: { ref?: string } }>;
};
type Job = {
  id: number; name: string; status: string; conclusion: string | null; html_url: string;
  started_at?: string | null; completed_at?: string | null; runner_name?: string | null;
  steps?: Array<{ name: string; number: number; status: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null }>;
};
type Artifact = { id: number; name: string; size_in_bytes: number; expired: boolean; created_at: string; expires_at: string; archive_download_url: string };
function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}
function parseRepo(input: string): { owner: string; repo: string; fullName: string } {
  const value = input.trim();
  let parts: string[];
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) parts = value.split("/");
  else {
    let url: URL;
    try { url = new URL(value); } catch { throw { status: 400, message: "Use owner/repository or an https://github.com/owner/repository URL." } satisfies ApiFailure; }
    if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) || url.username || url.password) {
      throw { status: 400, message: "Only GitHub repository URLs are supported." } satisfies ApiFailure;
    }
    parts = url.pathname.split("/").filter(Boolean).slice(0, 2);
    if (parts[1]) parts[1] = parts[1].replace(/\.git$/i, "");
  }
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part))) {
    throw { status: 400, message: "That repository value is not valid." } satisfies ApiFailure;
  }
  return { owner: parts[0], repo: parts[1], fullName: parts.join("/") };
}
async function github<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "AgentIQ-Repository-Runs" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const response = await fetch("https://api.github.com" + path, { headers, cache: "no-store" });
  if (!response.ok) {
    const failure: ApiFailure = {
      status: response.status === 404 ? 404 : response.status === 403 || response.status === 429 ? 429 : 502,
      message: response.status === 404 ? "Repository or workflow run not found, private, or inaccessible." :
        response.status === 403 || response.status === 429 ? "GitHub rate limit or Actions read permission prevented this request." :
        "GitHub Actions API returned HTTP " + response.status + ".",
    };
    throw failure;
  }
  return await response.json() as T;
}
async function optional<T>(path: string): Promise<{ value: T | null; available: boolean }> {
  try { return { value: await github<T>(path), available: true }; } catch { return { value: null, available: false }; }
}
function normaliseRun(run: Run) {
  return {
    id: run.id, name: run.name, title: run.display_title || run.name, url: run.html_url,
    workflowUrl: run.workflow_url || null, status: run.status, conclusion: run.conclusion,
    createdAt: run.created_at, updatedAt: run.updated_at, startedAt: run.run_started_at || null,
    runNumber: run.run_number, attempt: run.run_attempt, event: run.event, branch: run.head_branch,
    commitSha: run.head_sha, commitUrl: "https://github.com/" + (run.html_url.split("/actions/runs/")[0].split("/").slice(-2).join("/")) + "/commit/" + run.head_sha,
    workflowPath: run.path, actor: run.actor?.login || "Unknown", actorUrl: run.actor?.html_url || null,
    triggeredBy: run.triggering_actor?.login || null,
    commitMessage: run.head_commit?.message || null, commitAuthor: run.head_commit?.author?.name || null,
    pullRequests: (run.pull_requests || []).map((pr) => ({ number: pr.number, url: pr.html_url, head: pr.head?.ref || null, base: pr.base?.ref || null })),
  };
}
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } }); return; }
  const url = new URL(req.url || "/api/repository-runs", "https://agentiq.local");
  const input = url.searchParams.get("repo") || url.searchParams.get("url") || "";
  if (!input.trim()) { send(res, 400, { error: { code: "REPOSITORY_REQUIRED", message: "Specify the repository being inspected." } }); return; }
  try {
    const parsed = parseRepo(input);
    const base = "/repos/" + encodeURIComponent(parsed.owner) + "/" + encodeURIComponent(parsed.repo);
    const runId = url.searchParams.get("run_id");
    if (runId !== null) {
      if (!/^\d{1,20}$/.test(runId) || Number(runId) <= 0 || !Number.isSafeInteger(Number(runId))) {
        send(res, 400, { error: { code: "INVALID_RUN_ID", message: "Workflow run ID must be a positive integer." } }); return;
      }
      const [run, jobs, artifacts] = await Promise.all([
        github<Run>(base + "/actions/runs/" + runId),
        optional<{ total_count: number; jobs: Job[] }>(base + "/actions/runs/" + runId + "/jobs?filter=all&per_page=100"),
        optional<{ total_count: number; artifacts: Artifact[] }>(base + "/actions/runs/" + runId + "/artifacts?per_page=100"),
      ]);
      send(res, 200, { data: {
        repository: parsed.fullName, run: normaliseRun(run),
        jobs: { available: jobs.available, total: jobs.value?.total_count ?? null, items: (jobs.value?.jobs || []).map((job) => ({
          id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, url: job.html_url,
          startedAt: job.started_at || null, completedAt: job.completed_at || null, runner: job.runner_name || null,
          steps: (job.steps || []).map((step) => ({ name: step.name, number: step.number, status: step.status, conclusion: step.conclusion, startedAt: step.started_at || null, completedAt: step.completed_at || null })),
        })) },
        artifacts: { available: artifacts.available, total: artifacts.value?.total_count ?? null, items: (artifacts.value?.artifacts || []).map((item) => ({
          id: item.id, name: item.name, sizeBytes: item.size_in_bytes, expired: item.expired, createdAt: item.created_at, expiresAt: item.expires_at, downloadUrl: item.archive_download_url,
        })) },
        meta: { generatedAt: new Date().toISOString(), authenticated: Boolean(process.env.GITHUB_TOKEN), note: "Job steps and artifacts are included when GitHub exposes them. Log downloads require a separate request and may be unavailable for expired runs." },
      } });
      return;
    }
    const page = Math.max(1, Math.min(1000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const perPage = Math.max(10, Math.min(100, Number.parseInt(url.searchParams.get("per_page") || "25", 10) || 25));
    const status = url.searchParams.get("status") || "";
    const branch = (url.searchParams.get("branch") || "").trim().slice(0, 200);
    const event = url.searchParams.get("event") || "";
    const allowedStatus = new Set(["completed", "action_required", "cancelled", "failure", "neutral", "skipped", "stale", "success", "timed_out", "in_progress", "queued", "requested", "waiting", "pending"]);
    const allowedEvent = new Set(["branch_protection_rule", "check_run", "check_suite", "create", "delete", "deployment", "deployment_status", "discussion", "discussion_comment", "fork", "gollum", "issue_comment", "issues", "label", "merge_group", "milestone", "page_build", "public", "pull_request", "pull_request_review", "pull_request_review_comment", "pull_request_target", "push", "registry_package", "release", "repository_dispatch", "schedule", "status", "watch", "workflow_call", "workflow_dispatch", "workflow_run"]);
    const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    if (status && allowedStatus.has(status)) params.set("status", status);
    if (branch) params.set("branch", branch);
    if (event && allowedEvent.has(event)) params.set("event", event);
    const result = await github<{ total_count: number; workflow_runs: Run[] }>(base + "/actions/runs?" + params.toString());
    send(res, 200, { data: {
      repository: parsed.fullName, total: result.total_count, page, perPage,
      pageCount: Math.ceil(result.total_count / perPage), items: result.workflow_runs.map(normaliseRun),
      filters: { status: status && allowedStatus.has(status) ? status : null, branch: branch || null, event: event && allowedEvent.has(event) ? event : null },
      meta: { generatedAt: new Date().toISOString(), authenticated: Boolean(process.env.GITHUB_TOKEN), note: "Browse all workflow runs GitHub makes available through pagination. GitHub may cap some filtered searches; total reflects GitHub's reported count." },
    } });
  } catch (error) {
    const failure = error as Partial<ApiFailure>;
    const status = typeof failure.status === "number" ? failure.status : 502;
    send(res, status, { error: { code: status === 400 ? "INVALID_REPOSITORY" : status === 404 ? "REPOSITORY_OR_RUN_NOT_FOUND" : status === 429 ? "GITHUB_ACTIONS_UNAVAILABLE" : "REPOSITORY_RUNS_FAILED", message: typeof failure.message === "string" ? failure.message : "Unable to load workflow runs for this repository." } });
  }
}
