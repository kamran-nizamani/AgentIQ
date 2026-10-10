import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createApiHandler, createDemoStore } from "./server.js";

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
