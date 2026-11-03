import path from "node:path";

export type RunMode = "local" | "production";

const DEFAULT_HOST_PORT_START = 4001;
const PANEL_PORT = 3000;

const mode: RunMode = process.env.RENVER_MODE === "production" ? "production" : "local";

export const config = {
  dataDir: path.resolve(process.env.RENVER_DATA_DIR ?? "data"),
  mode,
  /** Only seeds the first domain. Domains are added and removed from the Domains page. */
  baseDomain: process.env.RENVER_BASE_DOMAIN ?? "localhost",
  /**
   * Where the panel itself is reachable through Caddy. On by default only in local mode;
   * in production it must be set explicitly, so the panel is never exposed on a hostname by accident.
   */
  panelHost: process.env.RENVER_PANEL_HOST ?? (mode === "local" ? "panel.localhost" : null),
  hostPortStart: Number(process.env.RENVER_HOST_PORT_START ?? DEFAULT_HOST_PORT_START),
  panelPort: PANEL_PORT,
  healthTimeoutMs: 90_000,
  memoryLimit: process.env.RENVER_APP_MEMORY ?? "512m",
  cpuLimit: process.env.RENVER_APP_CPUS ?? "1",
};

