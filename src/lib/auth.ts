export interface HeaderReader {
  get(name: string): string | null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SAME_ORIGIN_VALUES = new Set(["same-origin", "none"]);

export function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/** Compares SHA-256 digests so timing does not reveal the length or prefix of the secret. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!;
  return diff === 0;
}

/**
 * Blocks cross-site requests that change state. Browsers always send Sec-Fetch-Site
 * or Origin on such requests; non-browser clients (curl, scripts) send neither and are allowed.
 */
export function isSameOrigin(method: string, headers: HeaderReader): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;

  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return SAME_ORIGIN_VALUES.has(fetchSite);

  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
}
