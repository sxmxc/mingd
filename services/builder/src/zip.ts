import { deflateRawSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

export type ZipEntry = { name: string; contents: Buffer; mode?: number };

function crc32(contents: Buffer): number {
  let value = 0xffffffff;
  for (const byte of contents) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * Write a small, deterministic ZIP archive without relying on a host `zip`
 * executable. Paths and modes are supplied by server-owned packaging code.
 */
export async function writeZip(path: string, entries: ZipEntry[]): Promise<void> {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").some(part => !part || part === "." || part === "..") || names.has(entry.name)) throw new Error("Unsafe or duplicate ZIP entry.");
    names.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.contents, { level: 9 });
    const checksum = crc32(entry.contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 entry name
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.contents.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.mode ? 0x0314 : 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    if (entry.mode) central.writeUInt32LE((entry.mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    const record = Buffer.concat([local, name, compressed]);
    localRecords.push(record);
    centralRecords.push(Buffer.concat([central, name]));
    offset += record.length;
  }

  const centralSize = centralRecords.reduce((size, record) => size + record.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(path, Buffer.concat([...localRecords, ...centralRecords, end]));
}
