import type { IncomingMessage, ServerResponse } from "node:http";
import { configuredRepository } from "../server/github-live.js";

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported." } }));
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({
    data: {
      status: "ok",
      service: "agentiq-api",
      storage: "github-live",
      source: "GitHub Actions API",
      repository: configuredRepository(),
      authenticatedGitHub: Boolean(process.env.GITHUB_TOKEN),
      generatedAt: new Date().toISOString(),
    },
  }));
}
