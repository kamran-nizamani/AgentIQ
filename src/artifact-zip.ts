import { inflateRawSync } from "node:zlib";

/** Extract one named UTF-8 member from a ZIP archive without trusting archive paths. */
export function readZipTextMember(archive: Uint8Array, memberName: string, maxUncompressedBytes = 2_000_000): string | null {
  const bytes = Buffer.from(archive);
  const min = Math.max(0, bytes.length - 65_557);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= min; offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("Invalid ZIP archive: end-of-central-directory record is missing.");
  const entries = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralOffset = bytes.readUInt32LE(end + 16);
  if (centralOffset + centralSize > end || entries > 500) throw new Error("Invalid ZIP archive: central directory bounds are invalid.");
  let cursor = centralOffset;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP archive: malformed central directory entry.");
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (name === memberName) {
      if (uncompressedSize > maxUncompressedBytes || compressedSize > bytes.length) throw new Error("Evidence artifact member exceeds the allowed size.");
      if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid ZIP archive: local file header is malformed.");
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > bytes.length) throw new Error("Invalid ZIP archive: member data is truncated.");
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      let plain: Buffer;
      if (method === 0) plain = Buffer.from(compressed);
      else if (method === 8) plain = inflateRawSync(compressed, { maxOutputLength: maxUncompressedBytes });
      else throw new Error("Evidence artifact uses an unsupported ZIP compression method.");
      if (plain.length > maxUncompressedBytes || plain.length !== uncompressedSize) throw new Error("Evidence artifact member size is invalid.");
      return plain.toString("utf8");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
