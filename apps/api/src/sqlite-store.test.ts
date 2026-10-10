import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoStore } from "./server.js";
import { SQLiteAgentRunStore } from "./sqlite-store.js";

describe("SQLiteAgentRunStore", () => {
  let directory: string | undefined;
  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("persists records across store instances and filters by repository", async () => {
    directory = mkdtempSync(join(tmpdir(), "agentiq-store-"));
    const filename = join(directory, "runs.sqlite");
    const demoRecord = await createDemoStore().get("demo_8F2A");
    if (!demoRecord) throw new Error("Expected demo fixture.");
    const first = new SQLiteAgentRunStore(filename);
    await first.save(demoRecord);
    expect(await first.count()).toBe(1);
    first.close();

    const second = new SQLiteAgentRunStore(filename);
    expect(await second.get("demo_8F2A")).toMatchObject({ run: { id: "demo_8F2A" }, evidence: { schemaVersion: "1.0" } });
    expect(await second.count({ repository: "kamran-nizamani/AgentIQ" })).toBe(1);
    second.close();
  });

  it("treats the same evidence as an idempotent write", async () => {
    directory = mkdtempSync(join(tmpdir(), "agentiq-store-"));
    const store = new SQLiteAgentRunStore(join(directory, "runs.sqlite"));
    const record = await createDemoStore().get("demo_8F2A");
    if (!record) throw new Error("Expected demo fixture.");
    await store.save(record);
    await store.save(record);
    expect(await store.count()).toBe(1);
    store.close();
  });
});
