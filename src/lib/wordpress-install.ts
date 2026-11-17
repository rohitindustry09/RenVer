import http from "node:http";

/**
 * Sets up a fresh WordPress (title, admin account, language) by sending its own install form from this machine, the same
 * request a browser makes. Nothing here is logged with the password in it.
 */

export interface InstallRequest {
  /** The port WordPress answers on, on this machine. */
  port: number;
  /** The address people will use. WordPress is told it is being visited there, so it builds its links from it. */
  host: string;
  https: boolean;
  title: string;
  adminUser: string;
  adminEmail: string;
  adminPassword: string;
  language: string;
  indexable: boolean;
}

export type InstallOutcome = { ok: true; alreadyInstalled: boolean } | { ok: false; error: string; retry: boolean };

export interface SendOptions {
  port: number;
  path: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}
export type Sender = (options: SendOptions) => Promise<{ status: number; body: string }>;

const INSTALL_TIMEOUT_MS = 3 * 60 * 1000;
const ATTEMPTS = 6;
const RETRY_WAIT_MS = 5000;
const MAX_BODY_CHARS = 200_000;

export const httpSend: Sender = ({ port, path, method, headers, body, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path, method, headers: { ...headers, ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}) }, timeout: timeoutMs }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        if (text.length < MAX_BODY_CHARS) text += chunk;
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    request.on("timeout", () => request.destroy(new Error("WordPress took too long to answer.")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });

/** The form WordPress' install page expects. The search-engine box is a "discourage" tick, so it is only sent to turn it on. */
export function buildInstallBody(request: InstallRequest): string {
  const form = new URLSearchParams({
    weblog_title: request.title,
    user_name: request.adminUser,
    admin_password: request.adminPassword,
    admin_password2: request.adminPassword,
    admin_email: request.adminEmail,
    language: request.language,
    Submit: "Install WordPress",
  });
  if (!request.indexable) form.set("blog_public", "0");
  return form.toString();
}

const stripTags = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** What WordPress' answer to the install form means. */
export function interpretInstallPage(status: number, html: string): InstallOutcome {
  if (/already installed/i.test(html)) return { ok: true, alreadyInstalled: true };
  if (/<h1>\s*Success!?\s*<\/h1>/i.test(html)) return { ok: true, alreadyInstalled: false };
  if (/Error establishing a database connection/i.test(html)) return { ok: false, error: "WordPress could not reach its database yet.", retry: true };
  const message = /<p class="message">([\s\S]*?)<\/p>/i.exec(html)?.[1];
  if (message) return { ok: false, error: stripTags(message), retry: false };
  if (status >= 500 || status === 0) return { ok: false, error: `WordPress answered with an error (${status}).`, retry: true };
  return { ok: false, error: `WordPress did not confirm the installation (status ${status}).`, retry: false };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Installs WordPress. Tries again for a while if it is still starting. Safe to run twice: an installed site is left alone. */
export async function installWordPress(request: InstallRequest, send: Sender = httpSend, wait: (ms: number) => Promise<void> = sleep): Promise<InstallOutcome> {
  const headers = {
    Host: request.host,
    "X-Forwarded-Proto": request.https ? "https" : "http",
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "RenVer",
  };
  let last: InstallOutcome = { ok: false, error: "WordPress did not answer.", retry: true };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const reply = await send({ port: request.port, path: "/wp-admin/install.php?step=2", method: "POST", headers, body: buildInstallBody(request), timeoutMs: INSTALL_TIMEOUT_MS });
      last = interpretInstallPage(reply.status, reply.body);
    } catch (error) {
      last = { ok: false, error: error instanceof Error ? error.message : "WordPress did not answer.", retry: true };
    }
    if (last.ok || !last.retry) return last;
    if (attempt < ATTEMPTS) await wait(RETRY_WAIT_MS);
  }
  return last;
}
