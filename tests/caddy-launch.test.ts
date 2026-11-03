import { describe, expect, it } from "vitest";
import { caddyLaunchPlan } from "@/lib/caddy-launch";

describe("caddyLaunchPlan", () => {
  it("starts Caddy in its own session on Linux and macOS so it outlives the panel", () => {
    for (const platform of ["linux", "darwin"]) {
      const plan = caddyLaunchPlan(platform, "/usr/bin/caddy", "/var/lib/renver/caddy-bootstrap.json");
      expect(plan.command).toBe("/usr/bin/caddy");
      expect(plan.args).toEqual(["run", "--config", "/var/lib/renver/caddy-bootstrap.json", "--resume"]);
      expect(plan.options.detached).toBe(true);
      expect(plan.options.stdio).toBe("ignore");
    }
  });

  it("resumes the last saved config so a Caddy restart keeps its routes", () => {
    expect(caddyLaunchPlan("linux", "caddy", "c.json").args).toContain("--resume");
    expect(caddyLaunchPlan("win32", "caddy", "c.json").args.join(" ")).toContain("--resume");
  });

  it("launches through PowerShell on Windows so Caddy is not a child of the panel", () => {
    const plan = caddyLaunchPlan("win32", "C:\\Tools\\caddy.exe", "C:\\data\\caddy-bootstrap.json");
    expect(plan.command).toBe("powershell.exe");
    const script = plan.args.at(-1)!;
    expect(script).toContain("Start-Process");
    expect(script).toContain("-WindowStyle Hidden");
    expect(script).toContain("'C:\\Tools\\caddy.exe'");
    expect(script).toContain("'C:\\data\\caddy-bootstrap.json'");
    expect(plan.args).toEqual(expect.arrayContaining(["-NoProfile", "-NonInteractive"]));
  });

  it("keeps paths with spaces and quotes intact in the PowerShell command", () => {
    const plan = caddyLaunchPlan("win32", "C:\\Program Files\\Caddy\\caddy.exe", "C:\\Users\\O'Brien\\data\\c.json");
    const script = plan.args.at(-1)!;
    expect(script).toContain("'C:\\Program Files\\Caddy\\caddy.exe'");
    expect(script).toContain("'C:\\Users\\O''Brien\\data\\c.json'");
  });
});
