const QUICK_TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;

/** The public address cloudflared prints once a quick tunnel is up, or null for any other log line. */
export function parseTunnelUrl(line: string): string | null {
  return QUICK_TUNNEL_URL.exec(line)?.[0].toLowerCase() ?? null;
}
