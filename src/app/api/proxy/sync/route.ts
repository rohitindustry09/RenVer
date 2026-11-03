import { ok } from "@/lib/api";
import { syncProxy } from "@/lib/deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-sends every running project's route to Caddy, for example after a restart or a failed sync. */
export async function POST() {
  const lines: string[] = [];
  const applied = await syncProxy((line) => lines.push(line));
  return ok({ applied, message: lines.at(-1) ?? "" });
}
