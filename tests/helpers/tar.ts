import { gzipSync } from "node:zlib";

export interface TarEntry {
  name: string;
  content?: string | Buffer;
  type?: "file" | "dir" | "symlink" | "hardlink";
  linkname?: string;
}

const BLOCK = 512;
const TYPEFLAGS = { file: "0", dir: "5", symlink: "2", hardlink: "1" } as const;

function field(target: Buffer, offset: number, length: number, value: string): void {
  target.write(value.slice(0, length), offset, "latin1");
}

function header(entry: TarEntry, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  const type = entry.type ?? "file";
  field(block, 0, 100, entry.name);
  field(block, 100, 8, "0000644\0");
  field(block, 108, 8, "0000000\0");
  field(block, 116, 8, "0000000\0");
  field(block, 124, 12, `${size.toString(8).padStart(11, "0")}\0`);
  field(block, 136, 12, "00000000000\0");
  field(block, 148, 8, "        ");
  field(block, 156, 1, TYPEFLAGS[type]);
  field(block, 157, 100, entry.linkname ?? "");
  field(block, 257, 6, "ustar\0");
  field(block, 263, 2, "00");
  const checksum = block.reduce((sum, byte) => sum + byte, 0);
  field(block, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return block;
}

/** Builds a .tar.gz from explicit entries, so tests can create archives no real tool would write. */
export function makeTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const isFile = entry.type === "file" || entry.type === undefined;
    const content = isFile ? (entry.content ?? "") : "";
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    parts.push(header(entry, data.length), data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts));
}

/** A minimal valid RenVer backup, optionally with extra entries mixed in. */
export function validBackupEntries(extra: TarEntry[] = [], dbBytes: string | Buffer = "SQLite format 3\0"): TarEntry[] {
  return [
    { name: "./", type: "dir" },
    { name: "./MANIFEST.json", content: JSON.stringify({ format: 1, createdAt: "2026-03-05T14:07:09.000Z", kind: "manual", files: ["renver.db"] }) },
    { name: "./renver.db", content: dbBytes },
    ...extra,
  ];
}
