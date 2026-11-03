import { NextResponse } from "next/server";
import { getSetting } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For uptime monitors: answers 200 when the panel is up and can read its own database, 503 otherwise.
 * It needs no login and says nothing about what is deployed.
 */
export async function GET() {
  try {
    getSetting("health-probe");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
