import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentRunStore, RunHistoryQuery, StoredAgentRun } from "../../../src/storage.js";

const clone = <T>(value: T): T => structuredClone(value);
const sameEvidence = (left: StoredAgentRun, right: StoredAgentRun): boolean => {
  const canonical = (record: StoredAgentRun) => ({ ...record.evidence, evidence: record.evidence.evidence.map((item) => ({ ...item, provenance: { ...item.provenance, collectedAt: "" } })) });
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};
const repositoryOf = (record: StoredAgentRun): string | null => {
  const item = record.evidence.evidence.find((e) => typeof e.data.repository === "string");
  return item && typeof item.data.repository === "string" ? item.data.repository : null;
};

type Row = { run_id: string; repository: string | null; stored_at: string; record_json: string };

export class SQLiteAgentRunStore implements AgentRunStore {
  private readonly db: Database.Database;
  private readonly insert: Database.Statement;
  private readonly selectById: Database.Statement;
  private readonly selectAll: Database.Statement;
  private readonly countAll: Database.Statement;
  private readonly selectByRepository: Database.Statement;
  private readonly countByRepository: Database.Statement;

  constructor(filename = process.env.AGENTIQ_DB_PATH ?? "./data/agentiq.sqlite") {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        run_id TEXT PRIMARY KEY,
        repository TEXT,
        stored_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_stored_at ON agent_runs(stored_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_repository ON agent_runs(repository);
    `);
    this.insert = this.db.prepare("INSERT OR IGNORE INTO agent_runs (run_id, repository, stored_at, record_json) VALUES (?, ?, ?, ?)");
    this.selectById = this.db.prepare("SELECT run_id, repository, stored_at, record_json FROM agent_runs WHERE run_id = ?");
    this.selectAll = this.db.prepare("SELECT run_id, repository, stored_at, record_json FROM agent_runs ORDER BY stored_at DESC LIMIT ? OFFSET ?");
    this.countAll = this.db.prepare("SELECT COUNT(*) AS count FROM agent_runs");
    this.selectByRepository = this.db.prepare("SELECT run_id, repository, stored_at, record_json FROM agent_runs WHERE repository = ? ORDER BY stored_at DESC LIMIT ? OFFSET ?");
    this.countByRepository = this.db.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE repository = ?");
  }

  async save(record: StoredAgentRun): Promise<void> {
    const json = JSON.stringify(clone(record));
    const result = this.insert.run(record.run.id, repositoryOf(record), record.storedAt, json);
    if (result.changes === 0) {
      const existing = this.selectById.get(record.run.id) as Row | undefined;
      if (existing && existing.record_json !== json) {
        const old = JSON.parse(existing.record_json) as StoredAgentRun;
        if (!sameEvidence(old, record)) {
          throw new Error("Agent run already exists with different evidence: " + record.run.id);
        }
      }
    }
  }

  async get(runId: string): Promise<StoredAgentRun | null> {
    const row = this.selectById.get(runId) as Row | undefined;
    return row ? clone(JSON.parse(row.record_json) as StoredAgentRun) : null;
  }

  async list(query: RunHistoryQuery = {}): Promise<StoredAgentRun[]> {
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 1000);
    const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
    const rows = query.repository
      ? this.selectByRepository.all(query.repository, limit, offset) as Row[]
      : this.selectAll.all(limit, offset) as Row[];
    return rows.map((row) => clone(JSON.parse(row.record_json) as StoredAgentRun));
  }

  async count(query: Omit<RunHistoryQuery, "limit" | "offset"> = {}): Promise<number> {
    const row = query.repository
      ? this.countByRepository.get(query.repository) as { count: number }
      : this.countAll.get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
