import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/**
 * Serves the same `api/*.ts` handlers that Vercel runs in production, so `npm run dev`
 * shows real GitHub data with no separate backend. Settings come from the repository's
 * .env file (see .env.example) or the shell.
 */
export function devApi(mode: string): Plugin {
  return {
    name: "agentiq-dev-api",
    configureServer(server) {
      const env = loadEnv(mode, repoRoot, "");
      for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        const segments = url.pathname.split("/").filter(Boolean).slice(1);
        const file = segments.length === 1 ? `${segments[0]}.ts` : segments.length === 2 ? `${segments[0]}/[id].ts` : "";
        const path = resolve(repoRoot, "api", file);
        if (!file || !path.startsWith(resolve(repoRoot, "api")) || !existsSync(path)) return next();
        try {
          const module = await server.ssrLoadModule(path);
          await module.default(req, res);
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: { code: "DEV_API_ERROR", message: error instanceof Error ? error.message : "API handler failed." } }));
        }
      });
    },
  };
}
