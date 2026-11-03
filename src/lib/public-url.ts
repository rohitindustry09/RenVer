/**
 * The address the browser used, as seen through a reverse proxy. Behind Caddy, Next.js reports its own address
 * (https://localhost:3000) as the request's URL, so a redirect built from it sends people to a page that does not exist.
 * The proxy's forwarded headers, or failing that the Host header, say what the browser really typed. Edge-safe.
 */
const SAFE_HOST = /^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:]+\](:\d{1,5})?$/;
const first = (value: string | null): string => (value ?? "").split(",")[0]!.trim();

export function publicOrigin(headers: { get(name: string): string | null }, fallbackUrl: string): string {
  const fallback = new URL(fallbackUrl);
  const host = [first(headers.get("x-forwarded-host")), first(headers.get("host"))].find((h) => SAFE_HOST.test(h)) ?? fallback.host;
  const forwardedProto = first(headers.get("x-forwarded-proto")).toLowerCase();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : fallback.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
