import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveBinary } from "./binaries";
import { directoryStats } from "./dir-stats";
import { getGithubToken, gitAuthEnv } from "./github-auth";
import { redactToken } from "./github-token";
import { isValidBranch, parseGithubUrl } from "./github-url";
import { createUploadDir, discardUpload, finalizeUpload, type AnalyzedUpload } from "./uploads";

const CLONE_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_FILES = 20_000;
const MAX_BYTES = 500 * 1024 * 1024;
const STDERR_TAIL_CHARS = 2000;

const NOT_FOUND_PATTERN = /not found|could not read username|authentication failed|terminal prompts disabled|repository .* does not exist/i;
const BRANCH_MISSING_PATTERN = /remote branch .* not found/i;

/** Arguments are passed as an array (no shell), and the URL is rebuilt from validated parts. */
function cloneArgs(cloneUrl: string, dest: string, branch: string | null): string[] {
  return [
    "-c", "credential.helper=",
    "-c", "core.symlinks=false",
    "-c", "protocol.allow=never",
    "-c", "protocol.https.allow=always",
    "clone", "--depth", "1", "--single-branch", "--no-tags",
    ...(branch ? ["--branch", branch] : []),
    "--", cloneUrl, dest,
  ];
}

function runGit(args: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(resolveBinary("git"), args, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", ...extraEnv },
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, CLONE_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-STDERR_TAIL_CHARS);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-STDERR_TAIL_CHARS);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

function cloneFailureMessage(stderr: string, branch: string | null, timedOut: boolean, hasToken: boolean): string {
  if (timedOut) return "Cloning took too long. Try a smaller repository.";
  if (BRANCH_MISSING_PATTERN.test(stderr)) return `Branch "${branch ?? ""}" was not found in this repository.`;
  if (NOT_FOUND_PATTERN.test(stderr)) {
    return hasToken
      ? "Repository not found, or your GitHub token cannot read it. In GitHub, give the token access to this repository (Contents: Read-only)."
      : "Repository not found, or it is private. Connect GitHub in Settings to use private repositories.";
  }
  return "Could not clone the repository.";
}

/** The commit that was just cloned: its id and first message line. Missing values are null, never an error. */
export async function readHead(dest: string): Promise<{ commit: string | null; message: string | null }> {
  try {
    const id = await runGit(["-C", dest, "rev-parse", "HEAD"]);
    const subject = await runGit(["-C", dest, "log", "-1", "--format=%s"]);
    const commit = /^[0-9a-f]{40}$/.test(id.stdout.trim()) ? id.stdout.trim() : null;
    const message = subject.code === 0 ? subject.stdout.split(/\r?\n/)[0]!.trim().slice(0, 200) || null : null;
    return { commit, message };
  } catch {
    return { commit: null, message: null };
  }
}

export async function importFromGithub(input: { url: string; branch?: string | null }): Promise<AnalyzedUpload> {
  const parsed = parseGithubUrl(input.url);
  if (!parsed.ok) throw new Error(parsed.error);

  const branch = input.branch?.trim() || parsed.branch;
  if (branch && !isValidBranch(branch)) throw new Error("That branch name is not valid.");

  const { uploadId, base } = createUploadDir();
  const dest = path.join(base, "src");
  try {
    const token = getGithubToken();
    const { code, stderr, timedOut } = await runGit(cloneArgs(parsed.cloneUrl, dest, branch), gitAuthEnv(token));
    if (code !== 0) throw new Error(redactToken(cloneFailureMessage(stderr, branch, timedOut, token !== null), token));

    const { commit, message } = await readHead(dest);
    fs.rmSync(path.join(dest, ".git"), { recursive: true, force: true });
    const stats = directoryStats(dest, { maxFiles: MAX_FILES, maxBytes: MAX_BYTES });
    if (stats.files > MAX_FILES || stats.bytes > MAX_BYTES) throw new Error("This repository is too large to import.");

    return finalizeUpload(uploadId, base, dest, { source: "github", label: parsed.label, branch, commit, message });
  } catch (error) {
    discardUpload(base);
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Git is not installed. Install it from the Setup page.");
    }
    throw error;
  }
}
