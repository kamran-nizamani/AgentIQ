import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { createEvidenceBundle, ingestGitDiffEvidence, ingestGitHubActionsRun, ingestTestEvidence } from "../../../src/ingestion.js";
import { evaluateEvidence } from "../../../src/evaluation.js";
import { InMemoryAgentRunStore, toRunHistoryRow, type AgentRunStore, type StoredAgentRun } from "../../../src/storage.js";
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
      ...ingestGitHubActionsRun({
        runId: item.id,
        workflowName: item.task,
        status: "completed",
        conclusion: item.outcome === "success" ? "success" : "failure",
        startedAt,
        completedAt,
        repository: "kamran-nizamani/AgentIQ",
        commitSha: "demo-" + item.id.toLowerCase(),
      }),
      ingestTestEvidence({ framework: "vitest", total: item.total, passed: item.passed, failed: item.failed, durationMs: item.durationMs, sourceId: "tests:" + item.id }),
      ingestGitDiffEvidence({ baseCommit: "base-" + item.id, headCommit: "head-" + item.id, filesChanged: item.files, linesAdded: item.added, linesDeleted: item.deleted, sourceId: "diff:" + item.id }),
    ]);
    const run: AgentRun = {
      id: item.id,
      taskOutcome: item.outcome,
      tests: { total: item.total, passed: item.passed, failed: item.failed },
      changes: { filesChanged: item.files, linesAdded: item.added, linesDeleted: item.deleted },
      execution: { durationMs: item.durationMs },
      humanIntervention: { required: false, interventions: 0 },
      rollback: false,
    };
    const record: StoredAgentRun = {
      run,
      evidence,
      evaluation: evaluateEvidence(evidence, run),
      storedAt: completedAt,
    };
    void store.save(record);
    // Presentation metadata is intentionally carried by evidence, not used by the scorer.
    evidence.evidence[0].data.agent = item.agent;
    evidence.evidence[0].data.task = item.task;
  }
  return store;
}

export function createApiHandler(store: AgentRunStore = createDemoStore()) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      json(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET requests are supported." } });
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/health") {
      json(res, 200, { data: { status: "ok", service: "agentiq-api", storage: "in-memory-demo" } });
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
            agent: String(record.evidence.evidence.find((e) => typeof e.data.agent === "string")?.data.agent ?? "Unknown agent"),
            task: String(record.evidence.evidence.find((e) => typeof e.data.task === "string")?.data.task ?? "Evaluation run"),
            durationMs: record.run.execution.durationMs,
            tests: record.run.tests,
            changes: record.run.changes,
          })),
          pagination: { total, limit, offset, hasMore: offset + records.length < total },
          meta: { mode: "demo", note: "Seeded example data; connect a persistent store and ingestion pipeline for real runs." },
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
  server.listen(PORT, HOST, () => {
    console.log(`AgentIQ API listening on http://${HOST}:${PORT}`);
  });
}
