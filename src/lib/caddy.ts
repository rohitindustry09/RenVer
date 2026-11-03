import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { resolveBinary } from "./binaries";
import { caddyLaunchPlan } from "./caddy-launch";

import { isLocalDomain } from "./domain-names";

export interface AppRoute {
  /** Every hostname that should reach this app (subdomains and root domains alike). */
  hosts: string[];
  port: number;
}

export interface CaddyOptions {
  panel?: AppRoute;
}

interface CaddyHandler {
  handler: string;
  upstreams?: { dial: string }[];
  status_code?: number;
  body?: string;
}

interface CaddyRoute {
  match: { host: string[] }[];
  handle: CaddyHandler[];
}

export interface CaddyConfig {
  admin: { listen: string };
  apps: {
    http: {
      servers: {
        main: {
          listen: string[];
          automatic_https: { disable: boolean; skip?: string[] };
          routes: { match?: { host: string[] }[]; handle: CaddyHandler[] }[];
        };
      };
    };
  };
}

const LOOPBACK = "127.0.0.1";
export const CADDY_ADMIN_ADDRESS = "127.0.0.1:2019";

function proxyRoute({ hosts, port }: AppRoute): CaddyRoute {
  return {
    match: [{ host: hosts }],
    handle: [{ handler: "reverse_proxy", upstreams: [{ dial: `${LOOPBACK}:${port}` }] }],
  };
}

const notFoundRoute = {
  handle: [{ handler: "static_response", status_code: 404, body: "No app is deployed at this address." }],
};

/**
 * One server for every app. Real domains get automatic HTTPS (and an http to https redirect);
 * .localhost names are exempted so they stay on plain http, which is all a browser needs locally.
 */
export function buildCaddyConfig(routes: readonly AppRoute[], options: CaddyOptions = {}): CaddyConfig {
  const all = (options.panel ? [options.panel, ...routes] : [...routes]).filter((r) => r.hosts.length > 0);
  const hosts = all.flatMap((r) => r.hosts);
  const localHosts = hosts.filter(isLocalDomain);
  const hasPublicHost = hosts.some((h) => !isLocalDomain(h));

  return {
    admin: { listen: CADDY_ADMIN_ADDRESS },
    apps: {
      http: {
        servers: {
          main: {
            listen: hasPublicHost ? [":80", ":443"] : [":80"],
            automatic_https: {
              disable: !hasPublicHost,
              ...(hasPublicHost && localHosts.length > 0 ? { skip: localHosts } : {}),
            },
            routes: [...all.map(proxyRoute), notFoundRoute],
          },
        },
      },
    },
  };
}

const CADDY_PROBE_TIMEOUT_MS = 1500;
const CADDY_REQUEST_TIMEOUT_MS = 10_000;
const CADDY_START_ATTEMPTS = 10;
const CADDY_START_POLL_MS = 500;

interface AdminResponse {
  status: number;
  body: string;
}

/**
 * Talks to Caddy's admin API with node:http on purpose. Node's fetch adds browser-style headers
 * (Sec-Fetch-Mode: cors), and Caddy 2.11 then rejects the call as a cross-origin request.
 */
function adminRequest(
  address: string,
  method: "GET" | "POST",
  path: string,
  body?: string,
  timeoutMs = CADDY_REQUEST_TIMEOUT_MS,
): Promise<AdminResponse> {
  const separator = address.lastIndexOf(":");
  const host = address.slice(0, separator);
  const port = Number(address.slice(separator + 1));
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = body
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      : {};
    const req = http.request({ host, port, path, method, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Caddy admin request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Hostnames Caddy is routing right now, or null when its config cannot be read. */
export async function getLiveRouteHosts(address: string = CADDY_ADMIN_ADDRESS): Promise<string[] | null> {
  try {
    const response = await adminRequest(address, "GET", "/config/apps/http/servers/main/routes", undefined, CADDY_PROBE_TIMEOUT_MS);
    // A bare config (only the admin section) has no routes at all.
    if (response.status === 404 || response.body.trim() === "null") return [];
    if (response.status < 200 || response.status >= 300) return null;
    const routes = JSON.parse(response.body) as { match?: { host?: string[] }[] }[];
    return routes.flatMap((route) => (route.match ?? []).flatMap((m) => m.host ?? []));
  } catch {
    return null;
  }
}

export async function isCaddyRunning(address: string = CADDY_ADMIN_ADDRESS): Promise<boolean> {
  try {
    const response = await adminRequest(address, "GET", "/config/", undefined, CADDY_PROBE_TIMEOUT_MS);
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

/** Starts Caddy in the background with a bare config if it is installed but not running. */
export async function ensureCaddyRunning(bootstrapPath: string): Promise<boolean> {
  if (await isCaddyRunning()) return true;
  fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
  fs.writeFileSync(bootstrapPath, JSON.stringify({ admin: { listen: CADDY_ADMIN_ADDRESS } }));

  const plan = caddyLaunchPlan(process.platform, resolveBinary("caddy"), bootstrapPath);
  const spawned = await new Promise<boolean>((resolve) => {
    const child = spawn(plan.command, plan.args, plan.options);
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
  if (!spawned) return false;

  for (let attempt = 0; attempt < CADDY_START_ATTEMPTS; attempt++) {
    if (await isCaddyRunning()) return true;
    await new Promise((r) => setTimeout(r, CADDY_START_POLL_MS));
  }
  return false;
}

export async function applyCaddyConfig(config: CaddyConfig, address: string = CADDY_ADMIN_ADDRESS): Promise<void> {
  const response = await adminRequest(address, "POST", "/load", JSON.stringify(config));
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Caddy rejected the config: ${response.status} ${response.body}`);
  }
}
