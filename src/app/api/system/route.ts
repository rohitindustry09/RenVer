import { ok } from "@/lib/api";
import { isCaddyRunning } from "@/lib/caddy";
import { config } from "@/lib/config";
import { INSTALLABLE_TOOLS, getInstallPlan } from "@/lib/installer";
import { evaluate, summarize } from "@/lib/preflight";
import { collectSystemInfo } from "@/lib/system-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5000;

type Payload = ReturnType<typeof buildPayload> extends Promise<infer T> ? T : never;
const globalCache = globalThis as typeof globalThis & { __renverSystem?: { at: number; payload: Payload } };

async function buildPayload() {
  const info = await collectSystemInfo();
  const checks = evaluate(info, { caddyRunning: await isCaddyRunning() });
  const installHints = Object.fromEntries(
    INSTALLABLE_TOOLS.map((tool) => {
      const plan = getInstallPlan(tool, info.platform, info.isAdmin);
      return [tool, plan.ok ? { available: true, text: plan.plan.description } : { available: false, text: plan.error }];
    }),
  );
  return { checks, summary: summarize(checks), baseDomain: config.baseDomain, mode: config.mode, installHints };
}

/** Probing Docker and friends is slow, so recent results are reused unless ?fresh=1 is passed. */
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const cached = globalCache.__renverSystem;
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return ok(cached.payload);

  const payload = await buildPayload();
  globalCache.__renverSystem = { at: Date.now(), payload };
  return ok(payload);
}
