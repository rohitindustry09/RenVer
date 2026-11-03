import { failFrom, ok } from "@/lib/api";
import { POWER_ACTIONS, PowerError, setProjectPower, type PowerAction } from "@/lib/power";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: `{ "action": "pause" | "resume" | "restart" }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    const action = POWER_ACTIONS.find((a) => a === body.action) as PowerAction | undefined;
    if (!action) throw new PowerError("Choose pause, resume or restart.", 400);
    const result = await setProjectPower((await params).id, action);
    return ok({ action, deployId: result.deployId ?? null });
  } catch (error) {
    return failFrom(error, 500);
  }
}
