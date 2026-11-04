import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { detectProject, type DetectionResult, type ProjectFiles } from "./detect";
import { extractZip } from "./zip";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const UPLOAD_ID_PATTERN = /^[0-9a-f-]{36}$/;

export interface UploadMeta {
  source: "zip" | "github";
  label: string;
  branch: string | null;
  /** For a GitHub import: the full commit id that was fetched, and its first message line. */
  commit?: string | null;
  message?: string | null;
}

export interface AnalyzedUpload {
  uploadId: string;
  detection: DetectionResult;
  source: UploadMeta;
}

function uploadsDir(): string {
  return path.join(config.dataDir, "uploads");
}

export function directoryFiles(root: string): ProjectFiles {
  return {
    exists: (p) => fs.existsSync(path.join(root, p)),
    read: (p) => {
      try {
        return fs.readFileSync(path.join(root, p), "utf8");
      } catch {
        return null;
      }
    },
  };
}

function uploadBase(uploadId: string): string {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) throw new Error("Invalid upload id.");
  return path.join(uploadsDir(), uploadId);
}

export function sourceDirFor(uploadId: string): string {
  const marker = path.join(uploadBase(uploadId), "root.txt");
  if (!fs.existsSync(marker)) throw new Error("Upload not found. Please import the project again.");
  return fs.readFileSync(marker, "utf8");
}

export function createUploadDir(): { uploadId: string; base: string } {
  const uploadId = randomUUID();
  const base = uploadBase(uploadId);
  fs.mkdirSync(base, { recursive: true });
  return { uploadId, base };
}

/** Records where the project's files live, plus where they came from, and detects the framework. */
export function finalizeUpload(uploadId: string, base: string, root: string, meta: UploadMeta): AnalyzedUpload {
  fs.writeFileSync(path.join(base, "root.txt"), root);
  fs.writeFileSync(path.join(base, "meta.json"), JSON.stringify(meta));
  return { uploadId, detection: detectProject(directoryFiles(root)), source: meta };
}

export function discardUpload(base: string): void {
  fs.rmSync(base, { recursive: true, force: true });
}

function readMeta(base: string): UploadMeta {
  try {
    return JSON.parse(fs.readFileSync(path.join(base, "meta.json"), "utf8")) as UploadMeta;
  } catch {
    return { source: "zip", label: "Uploaded project", branch: null };
  }
}

/** Where an upload came from, without reading the project's files. Null when it is gone or unreadable. */
export function readUploadSource(uploadId: string): UploadMeta | null {
  try {
    const file = path.join(uploadBase(uploadId), "meta.json");
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as UploadMeta) : null;
  } catch {
    return null;
  }
}

export function getUpload(uploadId: string): AnalyzedUpload {
  const root = sourceDirFor(uploadId);
  return {
    uploadId,
    detection: detectProject(directoryFiles(root)),
    source: readMeta(uploadBase(uploadId)),
  };
}

export async function saveAndAnalyze(file: File): Promise<AnalyzedUpload> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Please upload a .zip file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Zip is larger than the 200 MB limit.");

  const { uploadId, base } = createUploadDir();
  const zipPath = path.join(base, "upload.zip");
  fs.writeFileSync(zipPath, Buffer.from(await file.arrayBuffer()));

  try {
    const { root } = extractZip(zipPath, path.join(base, "src"));
    return finalizeUpload(uploadId, base, root, { source: "zip", label: file.name, branch: null });
  } catch (error) {
    discardUpload(base);
    throw error;
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}
