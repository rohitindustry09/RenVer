import { needsInstall } from "./update-plan";

export type UpdateStatus = "idle" | "running" | "done" | "failed" | "restarting";
export type StepLabel = "pull" | "install" | "build";

export class UpdateError extends Error {
  constructor(message: string, readonly status: number = 409) {
    super(message);
  }
}

export interface UpdateState {
  status: UpdateStatus;
  step: StepLabel | null;
  message: string;
  startedAt: number | null;
  finishedAt: number | null;
}

interface RunOptions {
  env?: Record<string, string>;
}

export interface UpdateDeps {
  /** Runs one step, passing each line it prints to onLine, and resolves to its exit code. */
  run(label: StepLabel, command: string, args: string[], opts: RunOptions, onLine: (line: string) => void): Promise<number>;
  /** Runs a quick command and returns what it printed (empty when it failed). */
  read(command: string, args: string[]): Promise<string>;
  log(line: string): void;
  resetLog(): void;
  /** The build folder not currently being run, or null when the owner picked the folder themselves. */
  inactiveDir(): string | null;
  markGood(dir: string): void;
  markBad(dir: string): void;
  /** Free space on the disk the build writes to, in MB, or null when it cannot be read. */
  freeDiskMb(): number | null;
  /** True when a launcher will start the panel again after it exits with the restart code. */
  isSupervised: boolean;
  restart(): void;
  now(): number;
}

const IDLE: UpdateState = { status: "idle", step: null, message: "", startedAt: null, finishedAt: null };
const PREVIOUS_VERSION_NOTE = "The panel is still running the previous version.";
/** A production build writes a few hundred MB (plus a cache), so less than this is not worth starting. */
const MIN_FREE_MB = 2048;

/** Pulls the latest code, installs packages if needed, builds into a spare folder, and asks for a restart. */
export function createUpdateJob(deps: UpdateDeps) {
  let current: UpdateState = IDLE;

  const set = (patch: Partial<UpdateState>): void => {
    current = { ...current, ...patch };
  };
  const finish = (status: "done" | "failed" | "restarting", message: string): void => {
    deps.log(message);
    set({ status, step: null, message, finishedAt: deps.now() });
  };
  const step = async (label: StepLabel, command: string, args: string[], opts: RunOptions = {}): Promise<number> => {
    set({ step: label });
    deps.log(`$ ${[command, ...args].join(" ")}`);
    return deps.run(label, command, args, opts, deps.log);
  };

  async function execute(force: boolean): Promise<void> {
    const before = (await deps.read("git", ["rev-parse", "HEAD"])).trim();
    if ((await step("pull", "git", ["pull", "--ff-only"])) !== 0) {
      return finish("failed", "git pull failed, so nothing was changed. If this repository has local edits or has diverged from GitHub, fix that first.");
    }
    const after = (await deps.read("git", ["rev-parse", "HEAD"])).trim();
    if (before === after && !force) return finish("done", "Already up to date. Nothing to build.");

    const free = deps.freeDiskMb();
    if (free !== null && free < MIN_FREE_MB) {
      return finish(
        "failed",
        `Not enough disk space to build: ${(free / 1024).toFixed(1)} GB free, and a build needs about 2 GB. Free some space (Settings, Clean up the disk, removes Docker leftovers), then try again. ${PREVIOUS_VERSION_NOTE}`,
      );
    }

    const changed = before && after && before !== after ? (await deps.read("git", ["diff", "--name-only", before, after])).split("\n") : [];
    if (needsInstall(changed) && (await step("install", "npm", ["ci"])) !== 0) {
      return finish("failed", `Installing packages failed. ${PREVIOUS_VERSION_NOTE}`);
    }

    const dir = deps.inactiveDir();
    const code = await step("build", "next", ["build"], { env: dir ? { NEXT_DIST_DIR: dir } : {} });
    if (code !== 0) {
      if (dir) deps.markBad(dir);
      return finish("failed", `The build failed. ${PREVIOUS_VERSION_NOTE}`);
    }
    if (dir) deps.markGood(dir);

    if (!deps.isSupervised) return finish("done", "Built. Restart RenVer to start using the new version.");
    finish("restarting", "Built. Restarting the panel now…");
    deps.restart();
  }

  return {
    state: (): UpdateState => current,
    isRunning: (): boolean => current.status === "running",

    /** Resolves when the whole job is over (the panel may be about to exit). */
    async start({ force }: { force: boolean }): Promise<void> {
      if (current.status === "running" || current.status === "restarting") throw new UpdateError("An update is already running.");
      deps.resetLog();
      current = { status: "running", step: null, message: "", startedAt: deps.now(), finishedAt: null };
      try {
        await execute(force);
      } catch (error) {
        finish("failed", `The update stopped unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
