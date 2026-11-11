import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createApiHandler, createDemoStore } from "./server.js";

const request = globalThis.fetch.bind(globalThis);

describe("AgentIQ HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(createApiHandler(createDemoStore()));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("reports API health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: "ok", service: "agentiq-api", storage: "in-memory-demo" } });
  });

  it("returns paginated history and clearly marks demo data", async () => {
    const response = await fetch(`${baseUrl}/api/runs?limit=2&offset=0`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
    expect(body.meta.mode).toBe("in-memory-demo");
    expect(body.data[0]).toHaveProperty("score");
    expect(body.data[0]).toHaveProperty("agent");
  });

  it("returns a run detail with canonical evidence", async () => {
    const response = await fetch(`${baseUrl}/api/runs/demo_8F2A`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.run.id).toBe("demo_8F2A");
    expect(body.data.evidence.evidence.length).toBeGreaterThan(0);
    expect(body.data.evaluation.evaluation.score).toBeTypeOf("number");
  });


  it("proxies a Hanzo decision and returns typed answers", async () => {
    const previousKey = process.env.HANZO_API_KEY;
    process.env.HANZO_API_KEY = "test-hanzo-key";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      answers: { team: { choice: "infrastructure", probabilities: { infrastructure: 0.98 } }, critical: { noul: 0.94 } },
      routing: { checkpoint: "team,critical" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await request(`${baseUrl}/api/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: { message: "502 errors" },
          questions: {
            team: { type: "choice", instructions: "Choose a team", criteria: { infrastructure: "network errors" } },
            critical: { type: "noul", instructions: "Page on-call?" },
          },
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.data.answers.team.choice).toBe("infrastructure");
      expect(body.data.answers.critical.noul).toBe(0.94);
      expect(body.data.routing.checkpoint).toBe("team,critical");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer test-hanzo-key");
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.HANZO_API_KEY;
      else process.env.HANZO_API_KEY = previousKey;
    }
  });


  it("runs Hanzo decisions in explicit offline mock mode without an API key", async () => {
    const previousKey = process.env.HANZO_API_KEY;
    const previousMockMode = process.env.HANZO_MOCK_MODE;
    delete process.env.HANZO_API_KEY;
    process.env.HANZO_MOCK_MODE = "true";
    try {
      const response = await request(`${baseUrl}/api/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: { message: "Production API is returning 502 gateway errors" },
          questions: {
            team: { type: "choice", instructions: "Choose a team", criteria: { infrastructure: "network gateway outages 502 errors", billing: "invoices payments" } },
            critical: { type: "noul", instructions: "Page on-call?" },
          },
        }),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.meta.mode).toBe("mock");
      expect(body.data.mock).toBe(true);
      expect(body.data.answers.team.choice).toBe("infrastructure");
      expect(body.data.answers.critical.noul).toBe(0.9);
    } finally {
      if (previousKey === undefined) delete process.env.HANZO_API_KEY;
      else process.env.HANZO_API_KEY = previousKey;
      if (previousMockMode === undefined) delete process.env.HANZO_MOCK_MODE;
      else process.env.HANZO_MOCK_MODE = previousMockMode;
    }
  });

  it("preserves Hanzo billing and rate-limit refusals", async () => {
    const previousKey = process.env.HANZO_API_KEY;
    process.env.HANZO_API_KEY = "test-hanzo-key";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "RATE_LIMITED", message: "Too many requests", actions: ["Retry later"] },
    }), { status: 429 })));
    try {
      const response = await fetch(`${baseUrl}/api/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: {}, questions: { critical: { type: "noul", instructions: "Page?" } } }),
      });
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMITED", actions: ["Retry later"] } });
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.HANZO_API_KEY;
      else process.env.HANZO_API_KEY = previousKey;
    }
  });

  it("validates Hanzo decision request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: {}, questions: {} }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("returns a stable 404 response for unknown run IDs", async () => {
    const response = await fetch(`${baseUrl}/api/runs/does-not-exist`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "RUN_NOT_FOUND" } });
  });

  it("rejects invalid pagination values and non-GET methods", async () => {
    const invalid = await fetch(`${baseUrl}/api/runs?limit=500`);
    expect(invalid.status).toBe(400);
    const method = await fetch(`${baseUrl}/api/runs`, { method: "POST" });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
  });
});
