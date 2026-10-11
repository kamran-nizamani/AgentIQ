import { describe, expect, it } from "vitest";
import { readZipTextMember } from "../src/artifact-zip.js";

function zipSingle(name: string, value: string): Uint8Array {
  const filename = Buffer.from(name, "utf8");
  const data = Buffer.from(value, "utf8");
  const local = Buffer.alloc(30 + filename.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  filename.copy(local, 30);
  data.copy(local, 30 + filename.length);

  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  filename.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

describe("readZipTextMember", () => {
  it("reads the requested UTF-8 file from an artifact archive", () => {
    const archive = zipSingle("agentiq-evidence.json", '{"schemaVersion":"1.0"}');
    expect(readZipTextMember(archive, "agentiq-evidence.json")).toBe('{"schemaVersion":"1.0"}');
  });

  it("does not return unrelated archive members", () => {
    expect(readZipTextMember(zipSingle("other.txt", "no"), "agentiq-evidence.json")).toBeNull();
  });

  it("rejects malformed ZIP input", () => {
    expect(() => readZipTextMember(Buffer.from("not a zip"), "agentiq-evidence.json")).toThrow(/Invalid ZIP archive/);
  });

  it("rejects oversized evidence members", () => {
    expect(() => readZipTextMember(zipSingle("agentiq-evidence.json", "12345"), "agentiq-evidence.json", 4)).toThrow(/exceeds the allowed size/);
  });
});
