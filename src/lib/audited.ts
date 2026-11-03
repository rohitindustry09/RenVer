import { insertAudit } from "./db";
import { clientKey } from "./rate-limit";

/** Who is asking, for the log: the address a proxy reported, or "local" when the request came from this machine. */
export function actorOf(request: Request): string {
  const key = clientKey(request.headers);
  return key === "direct" ? "local" : key;
}

/** Adds an entry to the audit log. It must never break the request it describes, so errors are only reported. */
export function recordAudit(actor: string, action: string, target?: string, detail?: string): void {
  try {
    insertAudit({ actor, action, target, detail });
  } catch (error) {
    process.stderr.write(`[renver] could not write the audit log: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

interface Options {
  /** A short note about what was asked (never a secret), made from the JSON body, the route's ids and the URL. */
  detail?: (body: Record<string, unknown>, info: { params: Record<string, string>; url: URL }) => string | undefined;
}

/**
 * Wraps a route handler so that each time it succeeds (a 2xx answer) one entry goes into the audit log. A refused or
 * failed request is not logged as if it had happened. The target is the route's ids (a project id, a backup name…).
 */
export function audited<C>(
  action: string,
  handler: (request: Request, context: C) => Promise<Response> | Response,
  options: Options = {},
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    // The handler may read the body, so a copy is taken first, and only when a note needs it.
    const body = options.detail ? ((await request.clone().json().catch(() => ({}))) as Record<string, unknown>) : {};
    const response = await handler(request, context);
    if (response.status < 200 || response.status >= 300) return response;
    try {
      const raw = (context as { params?: Promise<Record<string, string>> } | undefined)?.params;
      const params = raw ? await raw : {};
      const detail = options.detail?.(body ?? {}, { params, url: new URL(request.url) });
      recordAudit(actorOf(request), action, Object.values(params).join("/"), detail);
    } catch (error) {
      process.stderr.write(`[renver] could not write the audit log: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    return response;
  };
}
