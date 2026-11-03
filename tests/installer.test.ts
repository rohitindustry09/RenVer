import { describe, expect, it } from "vitest";
import { getInstallPlan, isInstallableTool, INSTALLABLE_TOOLS } from "@/lib/installer";

describe("isInstallableTool", () => {
  it("accepts only allow-listed tools", () => {
    for (const tool of INSTALLABLE_TOOLS) expect(isInstallableTool(tool)).toBe(true);
    expect(isInstallableTool("rm -rf /")).toBe(false);
    expect(isInstallableTool("")).toBe(false);
    expect(isInstallableTool("Caddy")).toBe(false);
  });
});

describe("getInstallPlan", () => {
  it("uses winget with fixed package ids on Windows", () => {
    const result = getInstallPlan("caddy", "win32", false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.description).toBe("winget install CaddyServer.Caddy");
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0]!.command).toBe("winget");
    expect(result.plan.steps[0]!.args).toEqual(
      expect.arrayContaining(["install", "--id", "CaddyServer.Caddy", "-e", "--accept-package-agreements"]),
    );
  });

  it("treats winget's 'already installed / no update' exit codes as success", () => {
    const result = getInstallPlan("caddy", "win32", false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const accepted = result.plan.steps[0]!.okExitCodes ?? [0];
    expect(accepted).toContain(0);
    expect(accepted).toContain(2316632107); // UPDATE_NOT_APPLICABLE (0x8A15002B)
    expect(accepted).toContain(2316632161); // PACKAGE_ALREADY_INSTALLED (0x8A150061)
  });

  it("maps every tool on Windows", () => {
    const ids = { caddy: "CaddyServer.Caddy", git: "Git.Git", node: "OpenJS.NodeJS.LTS", docker: "Docker.DockerDesktop" };
    for (const tool of INSTALLABLE_TOOLS) {
      const result = getInstallPlan(tool, "win32", false);
      expect(result.ok && result.plan.steps[0]!.args).toContain(ids[tool]);
    }
  });

  it("requires root on Linux", () => {
    const result = getInstallPlan("git", "linux", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/root|sudo/i);
  });

  it("uses constant apt/official-script commands on Linux as root", () => {
    for (const tool of INSTALLABLE_TOOLS) {
      const result = getInstallPlan(tool, "linux", true);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const step of result.plan.steps) {
        expect(["sh", "apt-get"]).toContain(step.command);
      }
    }
  });

  it("uses Homebrew on macOS", () => {
    const result = getInstallPlan("docker", "darwin", false);
    expect(result.ok && result.plan.steps[0]!.command).toBe("brew");
  });

  it("reports unsupported platforms", () => {
    expect(getInstallPlan("git", "freebsd", true).ok).toBe(false);
  });
});
