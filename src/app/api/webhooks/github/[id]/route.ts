import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audited";
import { getProject } from "@/lib/db";
import { pushTargetsBranch, verifyGithubSignature } from "@/lib/webhook";
import { deployFromPush, githubSourceFor, webhookSecretFor } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status });

/**
 * GitHub calls this when someone pushes. It is open to the internet (GitHub cannot log in), so everything is decided by
 * the signature: without the project's secret nothing happens, and every refusal looks the same to the caller.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Push events are small; refuse anything big before reading it (this route is open to the internet).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "Payload too large." }, 413);
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json({ error: "Payload too large." }, 413);
  const project = getProject(id);
  const secret = project ? webhookSecretFor(id) : "";
  if (!project || !verifyGithubSignature(secret, body, request.headers.get("x-hub-signature-256"))) {
    return json({ error: "Invalid signature." }, 401);
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return json({ ok: true, message: "Connected." }, 200);
  if (event !== "push") return json({ ok: true, ignored: `Event "${event}" is not used.` }, 200);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Body is not JSON." }, 400);
  }
  const source = githubSourceFor(id);
  if (!source) return json({ error: "This project was not imported from GitHub." }, 409);
  if (!pushTargetsBranch(payload, source.branch)) return json({ ok: true, ignored: "Push was to another branch." }, 200);

  try {
    const started = await deployFromPush(id);
    recordAudit("github", "webhook.deploy", id, source.repo);
    return json({ ok: true, ...started }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not start the deploy." }, 502);
  }
}
