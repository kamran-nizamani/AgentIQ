export type RunHistoryQuery = { repository?: string; limit?: number; offset?: number };

import type { AgentRun, AgentEvaluation } from "./types.js";
import type { EvidenceBundle } from "./evidence.js";
import type { EvaluationReport } from "./evaluation.js";

export interface StoredAgentRun { run: AgentRun; evidence: EvidenceBundle; evaluation: EvaluationReport; storedAt: string; }
export interface AgentRunStore {
  save(record: StoredAgentRun): Promise<void>;
  get(runId: string): Promise<StoredAgentRun | null>;
  list(query?: RunHistoryQuery): Promise<StoredAgentRun[]>;
  count(query?: Omit<RunHistoryQuery, "limit" | "offset">): Promise<number>;
}

const clone = <T>(value: T): T => structuredClone(value);
const repositoryOf = (bundle: EvidenceBundle): string | undefined => {
  const item = bundle.evidence.find((e) => typeof e.data.repository === "string");
  return item && typeof item.data.repository === "string" ? item.data.repository : undefined;
};

export class InMemoryAgentRunStore implements AgentRunStore {
  private readonly records = new Map<string, StoredAgentRun>();
  async save(record: StoredAgentRun): Promise<void> {
    const existing = this.records.get(record.run.id);
    if (existing) {
      if (JSON.stringify(existing.evidence) !== JSON.stringify(record.evidence)) throw new Error("Agent run already exists with different evidence: " + record.run.id);
      return;
    }
    this.records.set(record.run.id, clone(record));
  }
  async get(runId: string): Promise<StoredAgentRun | null> {
    const record = this.records.get(runId);
    return record ? clone(record) : null;
  }
  async list(query: RunHistoryQuery = {}): Promise<StoredAgentRun[]> {
    const records = [...this.records.values()]
      .filter((r) => !query.repository || repositoryOf(r.evidence) === query.repository)
      .sort((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt));
    return clone(records.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50)));
  }
  async count(query: Omit<RunHistoryQuery, "limit" | "offset"> = {}): Promise<number> {
    return (await this.list({ ...query, limit: Number.MAX_SAFE_INTEGER })).length;
  }
}

export interface RunHistoryRow { runId: string; repository: string | null; score: number; grade: AgentEvaluation["grade"]; outcome: AgentRun["taskOutcome"]; storedAt: string; evidenceCount: number; riskCount: number; }
export function toRunHistoryRow(record: StoredAgentRun): RunHistoryRow {
  return { runId: record.run.id, repository: repositoryOf(record.evidence) ?? null, score: record.evaluation.evaluation.score, grade: record.evaluation.evaluation.grade, outcome: record.run.taskOutcome, storedAt: record.storedAt, evidenceCount: record.evidence.evidence.length, riskCount: record.evaluation.riskSignals.length };
}
