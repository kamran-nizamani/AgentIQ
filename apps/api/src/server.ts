import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { URL } from "node:url";
import { evaluateEvidence } from "../../../src/evaluation.js";
import { evidenceBundleToAgentRun } from "../../../src/normalize.js";
import { createEvidenceBundle, ingestGitDiffEvidence, ingestGitHubActionsRun, ingestTestEvidence } from "../../../src/ingestion.js";
import { createGitHubApiCollector } from "../../../src/github-api.js";
import { ingestWorkflowJobSnapshot, ingestWorkflowRunSnapshot } from "../../../src/github-ci.js";
import { InMemoryAgentRunStore, toRunHistoryRow, type AgentRunStore, type StoredAgentRun } from "../../../src/storage.js";
import { SQLiteAgentRunStore } from "./sqlite-store.js";
import type { AgentRun } from "../../../src/types.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Expected an integer between ${min} and ${max}.`);
  return parsed;
}

function safeSecretEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createDemoStore(): InMemoryAgentRunStore {
  const store = new InMemoryAgentRunStore();
  const examples: Array<{ id: string; outcome: AgentRun["taskOutcome"]; total: number; passed: number; failed: number; durationMs: number; files: number; added: number; deleted: number; minutesAgo: number; agent: string; task: string }> = [
    { id: "demo_8F2A", outcome: "success", total: 42, passed: 42, failed: 0, durationMs: 504000, files: 8, added: 210, deleted: 74, minutesAgo: 12, agent: "Claude Code", task: "Add CI evidence collector" },
    { id: "demo_7C91", outcome: "success", total: 31, passed: 29, failed: 2, durationMs: 662000, files: 12, added: 340, deleted: 120, minutesAgo: 38, agent: "Codex", task: "Fix PR patch parser" },
    { id: "demo_6D14", outcome: "partial", total: 24, passed: 19, failed: 5, durationMs: 887000, files: 18, added: 510, deleted: 160, minutesAgo: 65, agent: "Claude Code", task: "Normalize review events" },
  ];
  for (const item of examples) {
    const completedAt = new Date(Date.now() - item.minutesAgo * 60_000).toISOString();
    const startedAt = new Date(Date.parse(completedAt) - item.durationMs).toISOString();
    const evidence = createEvidenceBundle([
      ...ingestGitHubActionsRun({ runId: item.id, workflowName: item.task, status: "completed", conclusion: item.outcome === "success" ? "success" : "failure", startedAt, completedAt, repository: "kamran-nizamani/AgentIQ", commitSha: "demo-" + item.id.toLowerCase() }),
      ingestTestEvidence({ framework: "vitest", total: item.total, passed: item.passed, failed: item.failed, durationMs: item.durationMs, sourceId: "tests:" + item.id }),
      ingestGitDiffEvidence({ baseCommit: "base-" + item.id, headCommit: "head-" + item.id, filesChanged: item.files, linesAdded: item.added, linesDeleted: item.deleted, sourceId: "diff:" + item.id }),
    ]);
    evidence.evidence[0].data.agent = item.agent;
    evidence.evidence[0].data.task = item.task;
    const run: AgentRun = {
      id: item.id, taskOutcome: item.outcome,
      tests: { total: item.total, passed: item.passed, failed: item.failed },
      changes: { filesChanged: item.files, linesAdded: item.added, linesDeleted: item.deleted },
      execution: { durationMs: item.durationMs },
      humanIntervention: { required: false, interventions: 0 }, rollback: false,
    };
    const record: StoredAgentRun = { run, evidence, evaluation: evaluateEvidence(evidence, run), storedAt: completedAt };
    void store.save(record);
  }
  return store;
}

function createDefaultStore(): AgentRunStore {
  const filename = process.env.AGENTIQ_DB_PATH ?? "./data/agentiq.sqlite";
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const store = new SQLiteAgentRunStore(filename);
  if (process.env.AGENTIQ_DEMO !== "false") {
    void store.count().then((count) => {
      if (count === 0) {
        void createDemoStoreRecords().then((records) => Promise.all(records.map((record) => store.save(record))));
      }
    });
  }
  return store;
}

async function createDemoStoreRecords(): Promise<StoredAgentRun[]> {
  // Materialize starter rows through the public store contract rather than its internals.
  return createDemoStore().list({ limit: 10 });
}

async function collectGitHubRuns(store: AgentRunStore): Promise<{ collected: number; repository: string }> {
  const repository = process.env.AGENTIQ_GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error("Configure AGENTIQ_GITHUB_REPOSITORY and GITHUB_TOKEN before collecting GitHub evidence.");
  const collector = createGitHubApiCollector(repository, { token });
  const workflows = await collector.workflowRuns(25);
  let collected = 0;
  for (const workflow of workflows) {
    const workflowEvidence = ingestWorkflowRunSnapshot(repository, workflow);
    workflowEvidence.provenance.sourceId = repository + "#" + workflow.id;
    workflowEvidence.data.startedAt = workflow.createdAt;
    workflowEvidence.data.completedAt = workflow.status === "completed" ? workflow.updatedAt : null;
    const jobs = await collector.workflowJobs(workflow.id, 100);
    const evidence = createEvidenceBundle([
      workflowEvidence,
      ...jobs.map((job) => ingestWorkflowJobSnapshot(repository, workflow.id, job)),
    ]);
    const run = evidenceBundleToAgentRun(evidence);
    run.id = repository + "#" + workflow.id;
    const record: StoredAgentRun = {
      run,
      evidence,
      evaluation: evaluateEvidence(evidence, run),
      storedAt: workflow.updatedAt || workflow.createdAt,
    };
    await store.save(record);
    collected += 1;
  }
  return { collected, repository };
}

export function createApiHandler(store: AgentRunStore = createDefaultStore()) {
  const storageMode = store instanceof SQLiteAgentRunStore ? "sqlite" : "in-memory-demo";
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "POST" && url.pathname === "/api/ingest/github") {
      const expected = process.env.AGENTIQ_INGEST_TOKEN;
      const authorization = req.headers.authorization ?? "";
      const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!expected || !safeSecretEqual(provided, expected)) {
        json(res, 401, { error: { code: "UNAUTHORIZED", message: "A valid Bearer token is required for ingestion." } });
        return;
      }
      try {
        const result = await collectGitHubRuns(store);
        json(res, 200, { data: result, meta: { mode: storageMode } });
      } catch (error) {
        json(res, 502, { error: { code: "INGESTION_FAILED", message: error instanceof Error ? error.message : "GitHub ingestion failed." } });
      }
      return;
    }

    if (req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "This endpoint does not support the requested method." } });
      return;
    }
    if (url.pathname === "/api/health") {
      json(res, 200, { data: { status: "ok", service: "agentiq-api", storage: storageMode } });
      return;
    }
    if (url.pathname === "/api/runs") {
      try {
        const limit = parseInteger(url.searchParams.get("limit"), 20, 1, 100);
        const offset = parseInteger(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
        const repository = url.searchParams.get("repository")?.trim() || undefined;
        const query = { repository, limit, offset };
        const [records, total] = await Promise.all([store.list(query), store.count({ repository })]);
        json(res, 200, {
          data: records.map((record) => ({
            ...toRunHistoryRow(record),
            agent: String(record.evidence.evidence.find((e) => typeof e.data.agent === "string")?.data.agent ?? "GitHub Actions"),
            task: String(record.evidence.evidence.find((e) => typeof e.data.task === "string")?.data.task ?? "Workflow: " + (record.evidence.evidence.find((e) => e.kind === "workflow-run")?.data.name ?? "CI run")),
            durationMs: record.run.execution.durationMs,
            tests: record.run.tests,
            changes: record.run.changes,
          })),
          pagination: { total, limit, offset, hasMore: offset + records.length < total },
          meta: { mode: storageMode, note: storageMode === "sqlite" ? "Persistent SQLite run history." : "In-memory demo data; records disappear when the process exits." },
        });
      } catch (error) {
        json(res, 400, { error: { code: "INVALID_QUERY", message: error instanceof Error ? error.message : "Invalid query." } });
      }
      return;
    }
    const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (match) {
      let runId: string;
      try { runId = decodeURIComponent(match[1]); } catch {
        json(res, 400, { error: { code: "INVALID_RUN_ID", message: "Run ID is not valid URL encoding." } });
        return;
      }
      const record = await store.get(runId);
      if (!record) {
        json(res, 404, { error: { code: "RUN_NOT_FOUND", message: `No run exists with ID "${runId}".` } });
        return;
      }
      json(res, 200, { data: record, row: toRunHistoryRow(record) });
      return;
    }
    json(res, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
  };
}

if (process.env.NODE_ENV !== "test") {
  const server = createServer(createApiHandler());
  server.listen(PORT, HOST, () => console.log(`AgentIQ API listening on http://${HOST}:${PORT}`));
}
