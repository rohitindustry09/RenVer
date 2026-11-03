import type { SpawnOptions } from "node:child_process";

export interface LaunchPlan {
  command: string;
  args: string[];
  options: SpawnOptions;
}

/** Single-quotes a value for PowerShell, doubling any quotes inside it. */
const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * How to start Caddy so that it keeps running if the panel dies.
 *
 * - Unix: a detached child gets its own session, so it is not killed with the panel.
 * - Windows: a detached child is still part of the panel's process tree, and "end process tree" (or closing the
 *   terminal) kills it. Starting it through PowerShell's Start-Process makes the panel a grandparent that has
 *   already exited, so Caddy stands alone.
 *
 * --resume makes Caddy reload the last config it was running, so even a restart of Caddy alone keeps the routes.
 */
export function caddyLaunchPlan(platform: string, binary: string, configPath: string): LaunchPlan {
  if (platform === "win32") {
    const argumentList = ["run", "--config", configPath, "--resume"].map(psQuote).join(",");
    const script = `Start-Process -FilePath ${psQuote(binary)} -ArgumentList ${argumentList} -WindowStyle Hidden`;
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", script],
      options: { stdio: "ignore", windowsHide: true },
    };
  }
  return {
    command: binary,
    args: ["run", "--config", configPath, "--resume"],
    options: { detached: true, stdio: "ignore" },
  };
}
