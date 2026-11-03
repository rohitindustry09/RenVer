import { config } from "./config";
import { getHostBinding, getSetting, setSetting } from "./db";

const KEY = "panel_host";
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const MAX_HOST_LENGTH = 253;

/**
 * The address the panel itself is served on through Caddy. Changed from the Settings page (stored in the database); the
 * RENVER_PANEL_HOST variable only provides the starting value. Null means the panel is private (SSH tunnel or IP).
 */
export function getPanelHost(): string | null {
  const saved = getSetting(KEY);
  if (saved !== null) return saved || null;
  return config.panelHost || null;
}

export function savePanelHost(host: string): void {
  setSetting(KEY, host);
}

export type PanelHostCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Whether this is an allowed panel address: empty (keep the panel private), or a name on a domain whose ownership was
 * verified, and not already used by an app. Pure: the caller passes what is known.
 */
export function validatePanelHost(input: string, verifiedDomains: string[], isUsedByApp: (host: string) => boolean): PanelHostCheck {
  const host = input.trim().toLowerCase();
  if (host === "") return { ok: true, value: "" };
  if (host.length > MAX_HOST_LENGTH || !HOSTNAME.test(host)) {
    return { ok: false, error: "That is not a valid address. Use something like panel.example.com." };
  }
  if (!verifiedDomains.some((d) => host === d || host.endsWith(`.${d}`))) {
    return { ok: false, error: "The panel can only be served on a domain you added and verified on the Domains page." };
  }
  if (isUsedByApp(host)) return { ok: false, error: "An app already uses that address. Pick another one." };
  return { ok: true, value: host };
}

export const isUsedByApp = (host: string): boolean => getHostBinding(host) !== null;
