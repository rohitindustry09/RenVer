import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { listDeployUploadRefs } from "./db";
import { selectUploadsToDelete } from "./upload-retention";

/** Each project keeps the source of this many of its newest deploys, so that many versions can be rolled back to. */
export const KEEP_SOURCES_PER_PROJECT = 5;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UPLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/;

/** Deletes old saved sources so the disk does not fill up. Returns how many were removed. Never throws. */
export function pruneUploads(): number {
  try {
    const dir = path.join(config.dataDir, "uploads");
    if (!fs.existsSync(dir)) return 0;
    const now = Date.now();
    const onDisk = fs
      .readdirSync(dir)
      .filter((name) => UPLOAD_ID_PATTERN.test(name))
      .map((id) => ({ id, ageMs: now - fs.statSync(path.join(dir, id)).mtimeMs }));
    const doomed = selectUploadsToDelete({
      onDisk,
      deploys: listDeployUploadRefs(),
      keepPerProject: KEEP_SOURCES_PER_PROJECT,
      orphanMaxAgeMs: ORPHAN_MAX_AGE_MS,
    });
    for (const id of doomed) fs.rmSync(path.join(dir, id), { recursive: true, force: true });
    return doomed.length;
  } catch (error) {
    process.stderr.write(`[renver] could not clean up old sources: ${error instanceof Error ? error.message : String(error)}\n`);
    return 0;
  }
}
