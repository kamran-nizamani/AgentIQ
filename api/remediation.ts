import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { buildDiffEvidence, formatApprovalAuditComment, type ApprovalDecision } from "../src/remediation-evidence.js";

type Failure = { status: number; message: string };
type Pull = { number: number; title: string; html_url: string; state: string; head?: { ref?: string; sha?: string }; base?: { ref?: string } };
type PullFile = { filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string };
type Run = { id: number; name: string; html_url: string; status: string; conclusion: string | null; head_sha?: string };
type Comment = { id: number; body: string; html_url: string; created_at: string; updated_at: string; user?: { login?: string } };

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(body));
}
function safeEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function parseRepo(value: string): { owner: string; name: string; fullName: string } {
  const match = value.trim().match(/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/);
  if (!match) throw { status: 400, message: "Use a GitHub repository in owner/repository format." } satisfies Failure;
  return { owner: match[1], name: match[2], fullName: match[1] + "/" + match[2] };
}
function parsePullNumber(value: string | null): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw { status: 400, message: "A valid pull request number is required." } satisfies Failure;
  return number;
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw { status: 413, message: "Request body is too large." } satisfies Failure;
    chunks.push(buffer);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw { status: 400, message: "Request body must be valid JSON." } satisfies Failure; }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw { status: 400, message: "Request body must be a JSON object." } satisfies Failure;
  return body as Record<string, unknown>;
}
async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw { status: 503, message: "GitHub integration is not configured on the server." } satisfies Failure;
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AgentIQ-Remediation-Evidence",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 401 || response.status === 403 || response.status === 429 ? 403 : 502;
    throw { status, message: response.status === 404 ? "Pull request or repository was not found or is not accessible." : response.status === 401 || response.status === 403 ? "GitHub denied access. Check token permissions for pull requests and issue comments." : "GitHub API request failed with HTTP " + response.status + "." } satisfies Failure;
  }
  return await response.json() as T;
}
function githubPath(owner: string, name: string, suffix: string): string {
  return "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(name) + suffix;
}
function auditComments(comments: Comment[]) {
  return comments.filter((comment) => comment.body.includes("<!-- agentiq-remediation-audit:v1 -->")).map((comment) => ({
    id: comment.id,
    url: comment.html_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: comment.user?.login || "unknown",
    decision: comment.body.match(/- Decision: \*\*(APPROVED|REJECTED)\*\*/)?.[1]?.toLowerCase() || "unknown",
    body: comment.body,
  }));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/api/remediation", "https://agentiq.local");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET and POST are supported." } });
    return;
  }
  try {
    const repository = parseRepo(url.searchParams.get("repo") || "");
    const pullNumber = parsePullNumber(url.searchParams.get("pr"));
    const base = githubPath(repository.owner, repository.name, "");
    if (req.method === "GET") {
      const [pull, files, runs, comments] = await Promise.all([
        github<Pull>(base + "/pulls/" + pullNumber),
        github<PullFile[]>(base + "/pulls/" + pullNumber + "/files?per_page=100"),
        github<{ workflow_runs: Run[] }>(base + "/actions/runs?per_page=10"),
        github<Comment[]>(base + "/issues/" + pullNumber + "/comments?per_page=100"),
      ]);
      const matchingRuns = runs.workflow_runs.filter((run) => !run.head_sha || !pull.head?.sha || run.head_sha === pull.head.sha);
      const evidence = buildDiffEvidence(files, matchingRuns);
      send(res, 200, {
        data: {
          repository: repository.fullName,
          pullRequest: { number: pull.number, title: pull.title, url: pull.html_url, state: pull.state, headBranch: pull.head?.ref || "", headSha: pull.head?.sha || "", baseBranch: pull.base?.ref || "" },
          ...evidence,
          audit: auditComments(comments),
          auditWritable: Boolean(process.env.AGENTIQ_REMEDIATION_AUDIT_TOKEN && process.env.GITHUB_TOKEN),
          auditSetupRequired: !process.env.AGENTIQ_REMEDIATION_AUDIT_TOKEN ? "Set AGENTIQ_REMEDIATION_AUDIT_TOKEN in the server environment to enable authenticated audit writes." : null,
        },
      });
      return;
    }

    const expectedAuditToken = process.env.AGENTIQ_REMEDIATION_AUDIT_TOKEN;
    const authorization = req.headers.authorization || "";
    const suppliedAuditToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!expectedAuditToken || !safeEqual(suppliedAuditToken, expectedAuditToken)) {
      send(res, 401, { error: { code: "AUDIT_AUTH_REQUIRED", message: "A valid audit token is required. Configure AGENTIQ_REMEDIATION_AUDIT_TOKEN server-side and provide it only to an authorized reviewer." } });
      return;
    }
    const body = await readBody(req);
    const decision = body.decision;
    const proposalId = body.proposalId;
    const headSha = body.headSha;
    const checks = body.checks;
    const note = typeof body.note === "string" ? body.note.slice(0, 1000) : "";
    if (decision !== "approved" && decision !== "rejected") throw { status: 400, message: "Decision must be approved or rejected." } satisfies Failure;
    if (typeof proposalId !== "string" || !/^[a-z0-9-]{1,80}$/.test(proposalId)) throw { status: 400, message: "Proposal identifier is invalid." } satisfies Failure;
    if (typeof headSha !== "string" || !/^[a-f0-9]{7,64}$/i.test(headSha)) throw { status: 400, message: "A reviewed pull request head SHA is required." } satisfies Failure;
    if (!checks || typeof checks !== "object" || Array.isArray(checks)) throw { status: 400, message: "Review checklist is required." } satisfies Failure;
    const checkRecord = checks as Record<string, unknown>;
    const requiredChecks = ["evidenceReviewed", "testsDefined", "rollbackDefined", "diffReviewed"];
    if (requiredChecks.some((key) => typeof checkRecord[key] !== "boolean")) throw { status: 400, message: "All four review checklist fields must be boolean." } satisfies Failure;
    if (decision === "approved" && requiredChecks.some((key) => checkRecord[key] !== true)) {
      throw { status: 400, message: "Approval requires all four safety checks." } satisfies Failure;
    }
    const pull = await github<Pull>(base + "/pulls/" + pullNumber);
    if (!pull.head?.sha || pull.head.sha.toLowerCase() !== headSha.toLowerCase()) {
      throw { status: 409, message: "The pull request changed since this diff was reviewed. Reload evidence before recording a decision." } satisfies Failure;
    }
    const comment = formatApprovalAuditComment({
      proposalId,
      decision: decision as ApprovalDecision,
      repository: repository.fullName,
      pullNumber,
      headSha,
      checks: Object.fromEntries(requiredChecks.map((key) => [key, checkRecord[key] === true])),
      note,
    });
    const created = await github<Comment>(base + "/issues/" + pullNumber + "/comments", {
      method: "POST",
      body: JSON.stringify({ body: comment }),
    });
    send(res, 201, { data: { id: created.id, url: created.html_url, createdAt: created.created_at, decision, message: "Persistent audit comment recorded on the pull request. No code was changed or executed." } });
  } catch (cause) {
    const failure = cause as Partial<Failure>;
    send(res, failure.status || 502, { error: { code: failure.status === 400 ? "INVALID_REQUEST" : failure.status === 401 ? "UNAUTHORIZED" : failure.status === 409 ? "STALE_EVIDENCE" : failure.status === 413 ? "BODY_TOO_LARGE" : failure.status === 503 ? "NOT_CONFIGURED" : "REMEDIATION_REQUEST_FAILED", message: failure.message || "Could not load remediation evidence." } });
  }
}
