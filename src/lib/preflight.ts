export type CheckStatus = "ok" | "warn" | "missing" | "fail";

export interface ToolVersions {
  docker: string | null;
  dockerRunning: boolean;
  compose: string | null;
  caddy: string | null;
  git: string | null;
  node: string | null;
}

export interface SystemInfo {
  platform: string;
  osId: string;
  osVersion: string;
  arch: string;
  totalMemMB: number;
  freeDiskGB: number;
  isAdmin: boolean;
  tools: ToolVersions;
  portsInUse: number[];
}

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  fixable: boolean;
}

export interface PreflightSummary {
  canInstall: boolean;
  toInstall: string[];
  failures: string[];
  warnings: string[];
}

const MIN_MEM_MB = 1024;
const RECOMMENDED_MEM_MB = 2048;
const MIN_DISK_GB = 5;
const RECOMMENDED_DISK_GB = 20;
const REQUIRED_PORTS = [80, 443];
const MIN_UBUNTU_MAJOR = 22;
const MIN_DEBIAN_MAJOR = 12;

function check(
  id: string,
  label: string,
  status: CheckStatus,
  message: string,
  fixable = false,
): CheckResult {
  return { id, label, status, message, fixable };
}

function majorOf(version: string): number {
  return Number.parseInt(version.split(".")[0] ?? "", 10);
}

function checkOs(info: SystemInfo): CheckResult {
  const name = `${info.osId} ${info.osVersion}`.trim();
  if (info.platform === "win32" || info.platform === "darwin") {
    return check(
      "os",
      "Operating system",
      "warn",
      `${name}: supported for local development only. Use a Linux VPS for live hosting.`,
    );
  }
  const major = majorOf(info.osVersion);
  const supported =
    (info.osId === "ubuntu" && major >= MIN_UBUNTU_MAJOR) ||
    (info.osId === "debian" && major >= MIN_DEBIAN_MAJOR);
  return supported
    ? check("os", "Operating system", "ok", `${name} is supported.`)
    : check(
        "os",
        "Operating system",
        "fail",
        `${name} is not supported. Use Ubuntu ${MIN_UBUNTU_MAJOR}.04+ or Debian ${MIN_DEBIAN_MAJOR}+.`,
      );
}

function checkMemory(info: SystemInfo): CheckResult {
  const message = `${info.totalMemMB} MB RAM`;
  if (info.totalMemMB < MIN_MEM_MB) {
    return check("memory", "Memory", "fail", `${message}: at least ${MIN_MEM_MB} MB is required.`);
  }
  if (info.totalMemMB < RECOMMENDED_MEM_MB) {
    return check("memory", "Memory", "warn", `${message}: builds may fail, ${RECOMMENDED_MEM_MB} MB+ recommended.`);
  }
  return check("memory", "Memory", "ok", message);
}

function checkDisk(info: SystemInfo): CheckResult {
  const message = `${info.freeDiskGB} GB free`;
  if (info.freeDiskGB < MIN_DISK_GB) {
    return check("disk", "Disk space", "fail", `${message}: at least ${MIN_DISK_GB} GB is required.`);
  }
  if (info.freeDiskGB < RECOMMENDED_DISK_GB) {
    return check("disk", "Disk space", "warn", `${message}: ${RECOMMENDED_DISK_GB} GB+ recommended for images.`);
  }
  return check("disk", "Disk space", "ok", message);
}

function checkPrivileges(info: SystemInfo): CheckResult {
  if (info.platform !== "linux") {
    return check("privileges", "Privileges", "ok", "Not required on this platform.");
  }
  return info.isAdmin
    ? check("privileges", "Privileges", "ok", "Running as root.")
    : check("privileges", "Privileges", "fail", "Run as root or with sudo to install packages.");
}

function checkDocker(info: SystemInfo): CheckResult {
  const { docker, dockerRunning, compose } = info.tools;
  if (!docker) {
    return check("docker", "Docker", "missing", "Docker is not installed.", true);
  }
  if (!dockerRunning) {
    return check("docker", "Docker", "warn", `Docker ${docker} is installed but not running.`);
  }
  if (!compose) {
    return check("docker", "Docker", "missing", `Docker ${docker} found but the compose plugin is missing.`, true);
  }
  return check("docker", "Docker", "ok", `Docker ${docker}, compose ${compose}.`);
}

function checkTool(id: string, label: string, version: string | null): CheckResult {
  return version
    ? check(id, label, "ok", `${label} ${version}`)
    : check(id, label, "missing", `${label} is not installed.`, true);
}

function checkPorts(info: SystemInfo, caddyRunning: boolean): CheckResult {
  const busy = REQUIRED_PORTS.filter((p) => info.portsInUse.includes(p));
  if (busy.length === 0) return check("ports", "Ports 80/443", "ok", "Ports 80 and 443 are free.");
  // RenVer's own Caddy is what holds them once domains are in use, so busy ports are expected then.
  if (caddyRunning) return check("ports", "Ports 80/443", "ok", `Port(s) ${busy.join(", ")} are used by RenVer's Caddy, which serves your domains. This is expected.`);
  return check(
    "ports",
    "Ports 80/443",
    "warn",
    `Port(s) ${busy.join(", ")} are used by another program (often nginx, Apache or a second Caddy), so RenVer's Caddy cannot start. On a server, find it with: sudo ss -ltnp | grep -E ':80|:443'`,
  );
}

export function evaluate(info: SystemInfo, options: { caddyRunning?: boolean } = {}): CheckResult[] {
  return [
    checkOs(info),
    check("arch", "CPU architecture", info.arch === "x64" || info.arch === "arm64" ? "ok" : "fail", info.arch),
    checkMemory(info),
    checkDisk(info),
    checkPrivileges(info),
    checkDocker(info),
    checkTool("caddy", "Caddy", info.tools.caddy),
    checkTool("git", "Git", info.tools.git),
    checkTool("node", "Node.js", info.tools.node),
    checkPorts(info, options.caddyRunning ?? false),
  ];
}

export function summarize(checks: readonly CheckResult[]): PreflightSummary {
  const failures = checks.filter((c) => c.status === "fail").map((c) => c.id);
  return {
    canInstall: failures.length === 0,
    toInstall: checks.filter((c) => c.status === "missing" && c.fixable).map((c) => c.id),
    failures,
    warnings: checks.filter((c) => c.status === "warn").map((c) => c.id),
  };
}
