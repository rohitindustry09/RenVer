import { describe, expect, it } from "vitest";
import { diagnoseDocker, gatherDockerFacts, type DockerFacts } from "@/lib/docker-doctor";

const base: DockerFacts = {
  platform: "win32",
  cliInstalled: true,
  desktopRunning: true,
  desktopAgeSeconds: 600,
  serviceStatus: "running",
  wslOk: true,
  engineRunning: false,
};
const facts = (over: Partial<DockerFacts>): DockerFacts => ({ ...base, ...over });
const step = (d: ReturnType<typeof diagnoseDocker>, id: string) => d.steps.find((s) => s.id === id);

describe("diagnoseDocker on Windows", () => {
  it("says Docker is running when the engine answers", () => {
    const d = diagnoseDocker(facts({ engineRunning: true }));
    expect(d).toMatchObject({ state: "running", action: null });
  });

  it("explains Docker that is not installed, with nothing to start", () => {
    const d = diagnoseDocker(facts({ cliInstalled: false, desktopRunning: false }));
    expect(d).toMatchObject({ state: "not-installed", action: null });
    expect(step(d, "installed")?.ok).toBe(false);
  });

  it("starts Docker Desktop when it is not running", () => {
    const d = diagnoseDocker(facts({ desktopRunning: false, desktopAgeSeconds: null }));
    expect(d).toMatchObject({ state: "desktop-stopped", action: "start" });
    expect(step(d, "desktop")?.ok).toBe(false);
  });

  it("waits when Docker Desktop only just started", () => {
    const d = diagnoseDocker(facts({ desktopAgeSeconds: 40 }));
    expect(d).toMatchObject({ state: "engine-starting", action: null });
    expect(d.advice).toMatch(/wait|minute/i);
  });

  it("offers a restart when Docker Desktop has run a long time without an engine", () => {
    const d = diagnoseDocker(facts({ desktopAgeSeconds: 600 }));
    expect(d).toMatchObject({ state: "engine-stuck", action: "restart" });
    expect(d.advice).toMatch(/WSL/);
  });

  it("tells how to start a stopped Docker service, which needs administrator rights", () => {
    const d = diagnoseDocker(facts({ serviceStatus: "stopped" }));
    expect(d).toMatchObject({ state: "service-stopped", action: null });
    expect(d.advice).toContain("Start-Service com.docker.service");
  });

  it("does not call a missing Docker Desktop Service a failure (newer installs do not have one)", () => {
    const d = diagnoseDocker(facts({ desktopRunning: false, desktopAgeSeconds: null, serviceStatus: "missing" }));
    expect(step(d, "service")?.ok).toBeNull();
    expect(step(d, "service")?.detail).toMatch(/not installed|not needed/i);
    expect(d).toMatchObject({ state: "desktop-stopped", action: "start" });
  });

  it("explains a broken WSL", () => {
    const d = diagnoseDocker(facts({ wslOk: false }));
    expect(d).toMatchObject({ state: "wsl-problem", action: null });
    expect(d.advice).toContain("wsl --update");
    expect(step(d, "wsl")?.ok).toBe(false);
  });

  it("treats unknown facts as unknown, not as failures", () => {
    const d = diagnoseDocker(facts({ serviceStatus: null, wslOk: null, desktopAgeSeconds: null }));
    expect(d.state).toBe("engine-stuck");
    expect(step(d, "service")?.ok).toBeNull();
    expect(step(d, "wsl")?.ok).toBeNull();
  });
});

describe("diagnoseDocker elsewhere", () => {
  it("starts the Docker service on Linux when it is not active", () => {
    const d = diagnoseDocker(facts({ platform: "linux", desktopRunning: false, serviceStatus: "stopped", wslOk: null }));
    expect(d).toMatchObject({ state: "desktop-stopped", action: "start" });
  });

  it("starts Docker Desktop on macOS when it is not running", () => {
    expect(diagnoseDocker(facts({ platform: "darwin", desktopRunning: false, serviceStatus: null, wslOk: null }))).toMatchObject({ action: "start" });
  });
});

describe("gatherDockerFacts", () => {
  it("collects what each command says on Windows", async () => {
    const out: Record<string, { code: number; out: string }> = {
      "docker --version": { code: 0, out: "Docker version 29.9.3" },
      "powershell.exe": { code: 0, out: "412\n" },
      "sc.exe": { code: 0, out: "STATE              : 4  RUNNING" },
      "wsl.exe": { code: 0, out: "" },
      "docker info": { code: 1, out: "" },
    };
    const run = async (command: string, args: string[]) => out[command === "docker" ? `docker ${args[0] === "--version" ? "--version" : "info"}` : command]!;
    expect(await gatherDockerFacts("win32", run)).toEqual({
      platform: "win32",
      cliInstalled: true,
      desktopRunning: true,
      desktopAgeSeconds: 412,
      serviceStatus: "running",
      wslOk: true,
      engineRunning: false,
    });
  });

  it("reads a stopped service and a missing Docker Desktop", async () => {
    const run = async (command: string, args: string[]) => {
      if (command === "docker") return args[0] === "--version" ? { code: 0, out: "Docker version 1" } : { code: 1, out: "" };
      if (command === "powershell.exe") return { code: 0, out: "" };
      if (command === "sc.exe") return { code: 0, out: "STATE              : 1  STOPPED" };
      return { code: 1, out: "" };
    };
    const f = await gatherDockerFacts("win32", run);
    expect(f).toMatchObject({ desktopRunning: false, desktopAgeSeconds: null, serviceStatus: "stopped", wslOk: false });
  });
});
