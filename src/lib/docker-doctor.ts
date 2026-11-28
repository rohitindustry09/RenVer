export interface DockerFacts {
  platform: string;
  /** The docker command exists. */
  cliInstalled: boolean;
  /** Docker Desktop (Windows, macOS) or the Docker service (Linux) is running. */
  desktopRunning: boolean;
  /** How long Docker Desktop has been running, in seconds, when known. */
  desktopAgeSeconds: number | null;
  /** The Windows "Docker Desktop Service". Null when it does not apply or could not be read. */
  serviceStatus: "running" | "stopped" | "missing" | null;
  /** Whether WSL answers (Windows only). Null when it does not apply. */
  wslOk: boolean | null;
  engineRunning: boolean;
}

export type DockerState = "running" | "not-installed" | "desktop-stopped" | "engine-starting" | "engine-stuck" | "service-stopped" | "wsl-problem";
export type DockerAction = "start" | "restart";

export interface DockerStep {
  id: "installed" | "desktop" | "service" | "wsl" | "engine";
  label: string;
  /** Null when this could not be checked. */
  ok: boolean | null;
  detail: string;
}

export interface DockerDiagnosis {
  state: DockerState;
  steps: DockerStep[];
  advice: string;
  /** What RenVer can do about it by itself, or null when someone must act or just wait. */
  action: DockerAction | null;
}

/** Docker Desktop that started less than this long ago is still booting its engine, so it is waited for. */
const BOOT_GRACE_SECONDS = 120;

const isWindows = (facts: DockerFacts): boolean => facts.platform === "win32";

function stepsFor(facts: DockerFacts): DockerStep[] {
  const desktopName = facts.platform === "linux" ? "Docker service" : "Docker Desktop";
  const steps: DockerStep[] = [
    { id: "installed", label: "Docker is installed", ok: facts.cliInstalled, detail: facts.cliInstalled ? "The docker command was found." : "The docker command was not found." },
    {
      id: "desktop",
      label: `${desktopName} is running`,
      ok: facts.desktopRunning,
      detail: facts.desktopRunning ? (facts.desktopAgeSeconds === null ? "Running." : `Running for ${Math.round(facts.desktopAgeSeconds)}s.`) : "Not running.",
    },
  ];
  if (isWindows(facts)) {
    steps.push({
      id: "service",
      label: "Docker Desktop Service",
      // Newer Docker Desktop installs have no such service, so "missing" is not a problem.
      ok: facts.serviceStatus === null || facts.serviceStatus === "missing" ? null : facts.serviceStatus === "running",
      detail: facts.serviceStatus === "missing" ? "Not installed (not needed here)." : (facts.serviceStatus ?? "Could not be read."),
    });
    steps.push({ id: "wsl", label: "WSL (Windows Subsystem for Linux)", ok: facts.wslOk, detail: facts.wslOk === null ? "Could not be read." : facts.wslOk ? "Answers." : "Does not answer." });
  }
  steps.push({ id: "engine", label: "Docker engine answers", ok: facts.engineRunning, detail: facts.engineRunning ? "Docker answers." : "Docker does not answer yet." });
  return steps;
}

/** Works out why Docker is not answering and what to do next. Pure: it only reads the facts it is given. */
export function diagnoseDocker(facts: DockerFacts): DockerDiagnosis {
  const steps = stepsFor(facts);
  const done = (state: DockerState, advice: string, action: DockerAction | null = null): DockerDiagnosis => ({ state, steps, advice, action });

  if (facts.engineRunning) return done("running", "Docker is running.");
  if (!facts.cliInstalled) return done("not-installed", "Docker is not installed. Use the Install button for Docker above.");
  if (!facts.desktopRunning) {
    return done("desktop-stopped", facts.platform === "linux" ? "The Docker service is not running. RenVer can start it." : "Docker Desktop is not running. RenVer can start it.", "start");
  }
  if (isWindows(facts) && facts.serviceStatus === "stopped") {
    return done("service-stopped", "The Docker Desktop Service is stopped, and starting it needs administrator rights. In PowerShell as Administrator run: Start-Service com.docker.service");
  }
  if (isWindows(facts) && facts.wslOk === false) {
    return done("wsl-problem", "WSL does not answer, and Docker Desktop needs it. In PowerShell as Administrator run: wsl --update, then restart the computer if Windows asks.");
  }
  if (facts.desktopAgeSeconds !== null && facts.desktopAgeSeconds < BOOT_GRACE_SECONDS) {
    return done("engine-starting", "Docker Desktop is still starting its engine. Wait a minute or two, then check again.");
  }
  return done(
    "engine-stuck",
    isWindows(facts)
      ? "Docker Desktop is running but its engine never came up. Restarting Docker Desktop and WSL usually fixes it. This also stops any other WSL sessions you have open."
      : "Docker is running but does not answer. Restarting it usually fixes this.",
    "restart",
  );
}

type Run = (command: string, args: string[]) => Promise<{ code: number; out: string }>;

const SERVICE_STATE = /STATE\s*:\s*\d+\s+(\w+)/i;

/** Asks the system what it can about Docker. The command runner is passed in so this can be tested. */
export async function gatherDockerFacts(platform: string, run: Run): Promise<DockerFacts> {
  // The checks do not depend on each other, so they run together: one slow command must not delay the others.
  const [cli, engine] = await Promise.all([run("docker", ["--version"]), run("docker", ["info", "--format", "{{.ServerVersion}}"])]);
  const base = { platform, cliInstalled: cli.code === 0, engineRunning: engine.code === 0 && engine.out.trim() !== "" };

  if (platform === "win32") {
    const [age, service, wsl] = await Promise.all([
      run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$p = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { [int]((Get-Date) - $p.StartTime).TotalSeconds }",
      ]),
      run("sc.exe", ["query", "com.docker.service"]),
      run("wsl.exe", ["--status"]),
    ]);
    const seconds = Number.parseInt(age.out.trim(), 10);
    const state = SERVICE_STATE.exec(service.out)?.[1]?.toUpperCase();
    return {
      ...base,
      desktopRunning: Number.isFinite(seconds),
      desktopAgeSeconds: Number.isFinite(seconds) ? seconds : null,
      serviceStatus: service.code !== 0 && !state ? "missing" : state === "RUNNING" ? "running" : state ? "stopped" : null,
      wslOk: wsl.code === 0,
    };
  }
  if (platform === "darwin") {
    const proc = await run("pgrep", ["-x", "Docker"]);
    return { ...base, desktopRunning: proc.code === 0, desktopAgeSeconds: null, serviceStatus: null, wslOk: null };
  }
  const unit = await run("systemctl", ["is-active", "docker"]);
  return { ...base, desktopRunning: unit.out.trim() === "active", desktopAgeSeconds: null, serviceStatus: unit.out.trim() === "active" ? "running" : "stopped", wslOk: null };
}
