import { audited } from "@/lib/audited";
import { failFrom, ok } from "@/lib/api";
import { listDomains } from "@/lib/db";
import { syncProxy } from "@/lib/deploy";
import { getPanelHost, isUsedByApp, savePanelHost, validatePanelHost } from "@/lib/panel-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ host: getPanelHost() ?? "" });
}

/** Body: `{ "host": "panel.example.com" }`, or an empty host to keep the panel private. Applies at once, no restart. */
async function handlePUT(request: Request) {
  try {
    const body = (await request.json()) as { host?: unknown };
    const verified = listDomains().filter((d) => d.status === "verified").map((d) => d.name);
    const checked = validatePanelHost(typeof body.host === "string" ? body.host : "", verified, isUsedByApp);
    if (!checked.ok) return failFrom(checked.error, 400);
    savePanelHost(checked.value);
    const applied = await syncProxy(() => undefined);
    return ok({ host: checked.value, applied });
  } catch (error) {
    return failFrom(error, 500);
  }
}

export const PUT = audited("settings.panel-host", handlePUT, { detail: (body) => String(body.host ?? "") });
