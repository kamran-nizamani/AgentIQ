import type { IncomingMessage, ServerResponse } from "node:http";
import { GitHubLiveError, listLiveRuns } from "../server/github-live.js";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new GitHubLiveError("Query parameters must be valid integers.", 400);
  return parsed;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } });
    return;
  }
  try {
    const url = new URL(req.url || "/api/runs", "https://agentiq.local");
    const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 100);
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 10000);
    const result = await listLiveRuns({ limit, offset });
    sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof GitHubLiveError ? error.statusCode : 502;
    sendJson(res, status, { error: { code: error instanceof GitHubLiveError ? "GITHUB_LIVE_ERROR" : "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unable to load GitHub Actions runs." } });
  }
}
