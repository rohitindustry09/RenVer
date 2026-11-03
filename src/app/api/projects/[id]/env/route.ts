import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { getProject, updateProjectEnv } from "@/lib/db";
import { applyEnvChanges } from "@/lib/env-merge";
import { decryptEnv, encryptEnv } from "@/lib/secrets";
import { parseEnv } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => Object.assign(new Error("Project not found."), { status: 404 });
const BUSY = () => Object.assign(new Error("A deploy is in progress. Try again when it finishes."), { status: 409 });

/** The names of the variables that are set. Their values are never sent back to the browser. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const project = getProject((await params).id);
    if (!project) throw NOT_FOUND();
    return ok({ keys: Object.keys(decryptEnv(project.envEncrypted)).sort() });
  } catch (error) {
    return failFrom(error);
  }
}

/** Replaces all environment variables. */
async function handlePUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw NOT_FOUND();
    if (project.status === "deploying") throw BUSY();

    const body = (await request.json()) as { env?: unknown };
    const env = parseEnv(body.env);
    updateProjectEnv(id, encryptEnv(env));
    return ok({ count: Object.keys(env).length, keys: Object.keys(env).sort() });
  } catch (error) {
    return failFrom(error);
  }
}

/** Adds, changes or removes some variables and leaves the others alone. Body: `{ set?: {NAME: "value"}, remove?: ["NAME"] }`. */
async function handlePATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) throw NOT_FOUND();
    if (project.status === "deploying") throw BUSY();

    const body = (await request.json()) as { set?: unknown; remove?: unknown };
    const set = body.set === undefined ? {} : parseEnv(body.set);
    const remove = Array.isArray(body.remove) ? body.remove.filter((k): k is string => typeof k === "string") : [];
    const next = parseEnv(applyEnvChanges(decryptEnv(project.envEncrypted), { set, remove }));
    updateProjectEnv(id, encryptEnv(next));
    return ok({ count: Object.keys(next).length, keys: Object.keys(next).sort() });
  } catch (error) {
    return failFrom(error);
  }
}

export const PUT = audited("project.env", handlePUT, { detail: (b) => { const names = (v: unknown) => (v && typeof v === "object" ? Object.keys(v) : []); const set = names(b.set ?? b.env); const removed = Array.isArray(b.remove) ? b.remove.filter((k): k is string => typeof k === "string") : []; return [set.length ? `set ${set.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : ""].filter(Boolean).join("; ") || undefined; } });

export const PATCH = audited("project.env", handlePATCH, { detail: (b) => { const names = (v: unknown) => (v && typeof v === "object" ? Object.keys(v) : []); const set = names(b.set ?? b.env); const removed = Array.isArray(b.remove) ? b.remove.filter((k): k is string => typeof k === "string") : []; return [set.length ? `set ${set.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : ""].filter(Boolean).join("; ") || undefined; } });
