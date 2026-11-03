import { describe, expect, it } from "vitest";
import { evaluate, summarize, type SystemInfo } from "@/lib/preflight";

const goodLinux: SystemInfo = {
  platform: "linux",
  osId: "ubuntu",
  osVersion: "24.04",
  arch: "x64",
  totalMemMB: 4096,
  freeDiskGB: 50,
  isAdmin: true,
  tools: {
    docker: "27.0.1",
    dockerRunning: true,
    compose: "2.29.0",
    caddy: "2.8.4",
    git: "2.43.0",
    node: "22.4.0",
  },
  portsInUse: [],
};

const find = (info: SystemInfo, id: string) =>
  evaluate(info).find((c) => c.id === id)!;

describe("preflight evaluate", () => {
  it("passes everything on a healthy Ubuntu server", () => {
    const checks = evaluate(goodLinux);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(summarize(checks).canInstall).toBe(true);
  });

  it("fails on an unsupported Linux distro", () => {
    const check = find({ ...goodLinux, osId: "arch", osVersion: "rolling" }, "os");
    expect(check.status).toBe("fail");
  });

  it("fails on an old Ubuntu release", () => {
    const check = find({ ...goodLinux, osVersion: "18.04" }, "os");
    expect(check.status).toBe("fail");
  });

  it("accepts Debian 12", () => {
    const check = find({ ...goodLinux, osId: "debian", osVersion: "12" }, "os");
    expect(check.status).toBe("ok");
  });

  it("warns that Windows is dev mode only", () => {
    const check = find({ ...goodLinux, platform: "win32", osId: "windows", osVersion: "11" }, "os");
    expect(check.status).toBe("warn");
    expect(check.message).toMatch(/development/i);
  });

  it("warns under 2 GB RAM and fails under 1 GB", () => {
    expect(find({ ...goodLinux, totalMemMB: 1500 }, "memory").status).toBe("warn");
    expect(find({ ...goodLinux, totalMemMB: 800 }, "memory").status).toBe("fail");
  });

  it("warns under 20 GB disk and fails under 5 GB", () => {
    expect(find({ ...goodLinux, freeDiskGB: 12 }, "disk").status).toBe("warn");
    expect(find({ ...goodLinux, freeDiskGB: 3 }, "disk").status).toBe("fail");
  });

  it("marks missing Docker and Caddy as installable", () => {
    const info: SystemInfo = {
      ...goodLinux,
      tools: { ...goodLinux.tools, docker: null, dockerRunning: false, compose: null, caddy: null },
    };
    const docker = find(info, "docker");
    const caddy = find(info, "caddy");
    expect(docker.status).toBe("missing");
    expect(docker.fixable).toBe(true);
    expect(caddy.status).toBe("missing");
    const summary = summarize(evaluate(info));
    expect(summary.canInstall).toBe(true);
    expect(summary.toInstall).toEqual(expect.arrayContaining(["docker", "caddy"]));
  });

  it("warns when Docker is installed but not running", () => {
    const info: SystemInfo = { ...goodLinux, tools: { ...goodLinux.tools, dockerRunning: false } };
    expect(find(info, "docker").status).toBe("warn");
  });

  it("warns when ports 80 or 443 are busy", () => {
    const check = find({ ...goodLinux, portsInUse: [80] }, "ports");
    expect(check.status).toBe("warn");
    expect(check.message).toContain("80");
  });

  it("treats busy ports as expected when RenVer's own Caddy is running", () => {
    const check = evaluate({ ...goodLinux, portsInUse: [80, 443] }, { caddyRunning: true }).find((c) => c.id === "ports")!;
    expect(check.status).toBe("ok");
    expect(check.message).toContain("RenVer's Caddy");
  });

  it("fails without root on Linux", () => {
    const check = find({ ...goodLinux, isAdmin: false }, "privileges");
    expect(check.status).toBe("fail");
  });

  it("blocks install when a hard check fails", () => {
    const summary = summarize(evaluate({ ...goodLinux, totalMemMB: 500 }));
    expect(summary.canInstall).toBe(false);
  });
});
