import type { IncomingMessage, ServerResponse } from "node:http";
import { getLiveRun, GitHubLiveError } from "../../server/github-live.js";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } }));
    return;
  }
  try {
    const url = new URL(req.url || "/", "https://agentiq.local");
    const segments = url.pathname.split("/").filter(Boolean);
    const runId = decodeURIComponent(segments[segments.length - 1] || "");
    const data = await getLiveRun(runId);
    res.statusCode = 200;
    res.end(JSON.stringify({ data }));
  } catch (error) {
    res.statusCode = error instanceof GitHubLiveError ? error.statusCode : 502;
    res.end(JSON.stringify({ error: { code: error instanceof GitHubLiveError ? "GITHUB_LIVE_ERROR" : "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unable to load run details." } }));
  }
}
