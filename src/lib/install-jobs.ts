import { spawn } from "node:child_process";
import { getInstallPlan, type InstallPlan, type InstallableTool } from "./installer";
import { appendLog, resetLog } from "./logs";
import { enqueue } from "./queue";

export type InstallStatus = "idle" | "running" | "done" | "failed";

export type StartResult =
  | { ok: true; logId: string }
  | { ok: false; error: string; status: number };

const STEP_TIMEOUT_MS = 15 * 60 * 1000;

const globalJobs = globalThis as typeof globalThis & { __renverInstalls?: Map<string, InstallStatus> };

function jobs(): Map<string, InstallStatus> {
  globalJobs.__renverInstalls ??= new Map();
  return globalJobs.__renverInstalls;
}

export function installLogId(tool: InstallableTool): string {
  return `install-${tool}`;
}

export function installStatus(tool: InstallableTool): InstallStatus {
  return jobs().get(tool) ?? "idle";
}

function runStep(command: string, args: string[], onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    let pending = "";
    const child = spawn(command, args, { windowsHide: true });
    const timer = setTimeout(() => {
      onLine("Install timed out.");
      child.kill();
    }, STEP_TIMEOUT_MS);
    const feed = (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      lines.map((l) => l.trim()).filter(Boolean).forEach(onLine);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.once("error", (error) => {
      clearTimeout(timer);
      onLine(`Could not run ${command}: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (pending.trim()) onLine(pending.trim());
      resolve(code ?? 1);
    });
  });
}

async function runPlan(tool: InstallableTool, plan: InstallPlan): Promise<void> {
  const logId = installLogId(tool);
  const log = (line: string) => appendLog(logId, line);
  log(`Running: ${plan.description}`);
  for (const step of plan.steps) {
    const code = await runStep(step.command, step.args, log);
    if (code !== 0 && (step.okExitCodes ?? []).includes(code)) {
      log("Already installed. Nothing more to do.");
    } else if (code !== 0) {
      log(`Failed (exit ${code}).`);
      jobs().set(tool, "failed");
      return;
    }
  }
  log("Finished. Refreshing system status...");
  jobs().set(tool, "done");
}

export function startInstall(tool: InstallableTool, platform: string, isAdmin: boolean): StartResult {
  if (installStatus(tool) === "running") {
    return { ok: false, error: `${tool} is already being installed.`, status: 409 };
  }
  const result = getInstallPlan(tool, platform, isAdmin);
  if (!result.ok) return { ok: false, error: result.error, status: 400 };

  const logId = installLogId(tool);
  resetLog(logId);
  jobs().set(tool, "running");
  void enqueue(async () => {
    try {
      await runPlan(tool, result.plan);
    } catch (error) {
      appendLog(logId, `Failed: ${error instanceof Error ? error.message : String(error)}`);
      jobs().set(tool, "failed");
    }
  });
  return { ok: true, logId };
}
