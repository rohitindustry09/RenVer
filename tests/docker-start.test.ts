import { describe, expect, it } from "vitest";
import { dockerRestartPlan, dockerStartPlan } from "@/lib/docker-start";

describe("dockerStartPlan", () => {
  it("starts Docker Desktop through PowerShell on Windows, from its normal install folder", () => {
    const result = dockerStartPlan("win32", false, { ProgramFiles: "C:\\Program Files" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.command).toBe("powershell.exe");
    const script = result.plan.args.join(" ");
    expect(script).toContain("Start-Process");
    expect(script).toContain("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe");
    // A failure to launch must show up as a failed command, so it is waited for (it returns as soon as the program has started).
    expect(script).toContain("ErrorActionPreference");
    expect(result.plan.isDetached).toBe(false);
  });

  it("falls back to the usual Program Files folder when the variable is missing", () => {
    const result = dockerStartPlan("win32", false, {});
    expect(result.ok && result.plan.args.join(" ")).toContain("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe");
  });

  it("quotes the path so a quote in a folder name cannot break out", () => {
    const result = dockerStartPlan("win32", false, { ProgramFiles: "C:\\Odd'Folder" });
    expect(result.ok && result.plan.args.join(" ")).toContain("C:\\Odd''Folder");
  });

  it("opens Docker Desktop on macOS", () => {
    const result = dockerStartPlan("darwin", false, {});
    expect(result.ok && result.plan.command).toBe("open");
    expect(result.ok && result.plan.args).toEqual(["-a", "Docker"]);
  });

  it("starts the Docker service on Linux when running as root, and waits for it", () => {
    const result = dockerStartPlan("linux", true, {});
    expect(result.ok && result.plan.command).toBe("systemctl");
    expect(result.ok && result.plan.args).toEqual(["start", "docker"]);
    expect(result.ok && result.plan.isDetached).toBe(false);
  });

  it("explains that Linux needs root", () => {
    const result = dockerStartPlan("linux", false, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/root|sudo/i);
  });

  it("reports an unsupported system", () => {
    expect(dockerStartPlan("freebsd", true, {}).ok).toBe(false);
  });
});

describe("dockerRestartPlan", () => {
  it("on Windows closes Docker Desktop, shuts WSL down and starts Docker Desktop again, waiting for it", () => {
    const result = dockerRestartPlan("win32", false, { ProgramFiles: "C:\\Program Files" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const script = result.plan.args.join(" ");
    expect(result.plan.command).toBe("powershell.exe");
    expect(script).toContain("Stop-Process -Name 'Docker Desktop'");
    expect(script).toContain("wsl.exe --shutdown");
    expect(script).toContain("Start-Process");
    expect(script).toContain("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe");
    expect(script.indexOf("--shutdown")).toBeLessThan(script.indexOf("Start-Process"));
    expect(result.plan.isDetached).toBe(false);
  });

  it("restarts the Docker service on Linux as root, and explains that it needs root otherwise", () => {
    const ok = dockerRestartPlan("linux", true, {});
    expect(ok.ok && ok.plan.args).toEqual(["restart", "docker"]);
    expect(dockerRestartPlan("linux", false, {}).ok).toBe(false);
  });

  it("opens Docker Desktop on macOS", () => {
    const result = dockerRestartPlan("darwin", false, {});
    expect(result.ok && result.plan.command).toBe("open");
  });
});
