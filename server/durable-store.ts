import type { LiveRunRecord } from "./github-live.js";

type JsonRecord = Record<string, unknown>;
type StoredSummary = { run_id: string; repository: string; stored_at: string; summary: LiveRunRecord };
type StoredDetail = { run_id: string; repository: string; stored_at: string; detail: unknown };

function configuration(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("SUPABASE_URL must use HTTPS.");
    }
    return { url: parsed.origin, key };
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL.");
  }
}

export function durableStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; contentRange: string | null }> {
  const config = configuration();
  if (!config) throw new Error("Durable storage is not configured.");
  const response = await fetch(config.url + "/rest/v1/" + path, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: "Bearer " + config.key,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    // Avoid echoing PostgREST response bodies: they can include database details.
    throw new Error("Durable storage request failed with HTTP " + response.status + ".");
  }
  const text = await response.text();
  return { data: (text ? JSON.parse(text) : null) as T, contentRange: response.headers.get("content-range") };
}

function queryRepository(repository: string): string {
  return "repository=eq." + encodeURIComponent(repository);
}

export async function saveRunSummaries(repository: string, summaries: LiveRunRecord[]): Promise<void> {
  if (!durableStorageConfigured() || summaries.length === 0) return;
  const rows: StoredSummary[] = summaries.map((summary) => ({
    run_id: summary.runId,
    repository,
    stored_at: summary.storedAt,
    summary,
  }));
  await request<unknown>("agentiq_run_summaries?on_conflict=repository%2Crun_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export async function saveRunDetail(repository: string, runId: string, detail: unknown, storedAt = new Date().toISOString()): Promise<void> {
  if (!durableStorageConfigured()) return;
  const row: StoredDetail = { run_id: runId, repository, stored_at: storedAt, detail };
  await request<unknown>("agentiq_run_details?on_conflict=repository%2Crun_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
}

export async function getStoredRunDetail(repository: string, runId: string): Promise<unknown | null> {
  if (!durableStorageConfigured()) return null;
  const path = "agentiq_run_details?select=detail&repository=eq." + encodeURIComponent(repository) +
    "&run_id=eq." + encodeURIComponent(runId) + "&limit=1";
  const result = await request<Array<{ detail: unknown }>>(path);
  return result.data[0]?.detail ?? null;
}

export async function listStoredRunSummaries(options: { repository: string; limit: number; offset: number }): Promise<{ data: LiveRunRecord[]; total: number }> {
  if (!durableStorageConfigured()) return { data: [], total: 0 };
  const path = "agentiq_run_summaries?select=summary,stored_at&" + queryRepository(options.repository) +
    "&order=stored_at.desc,run_id.desc&limit=" + options.limit + "&offset=" + options.offset;
  const result = await request<Array<{ summary: LiveRunRecord; stored_at: string }>>(path, {
    headers: { Prefer: "count=exact" },
  });
  const totalMatch = result.contentRange?.match(/\/(\d+)$/);
  return { data: result.data.map((row) => ({ ...row.summary, storedAt: row.stored_at || row.summary.storedAt })), total: totalMatch ? Number(totalMatch[1]) : result.data.length };
}

export function isDurableStorageError(error: unknown): boolean {
  return error instanceof Error && /Durable storage/.test(error.message);
}
