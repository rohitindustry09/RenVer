import { failFrom, ok } from "@/lib/api";
import { describeTarget, validateNotifyUrl } from "@/lib/notify";
import { getNotifyUrl, saveNotifyUrl, sendNotification } from "@/lib/notifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether alerts are sent, and to which service. The address itself is never sent back to the browser. */
export async function GET() {
  const target = getNotifyUrl();
  return ok({ isOn: target !== "", target: target ? describeTarget(target) : "" });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const checked = validateNotifyUrl(String(body.url ?? ""));
    if (!checked.ok) return failFrom(checked.error, 400);
    saveNotifyUrl(checked.value);
    return ok({ isOn: checked.value !== "", target: checked.value ? describeTarget(checked.value) : "" });
  } catch (error) {
    return failFrom(error, 500);
  }
}

/** Sends a test message to the saved address. */
export async function POST() {
  try {
    const target = getNotifyUrl();
    if (!target) return failFrom("Save an address first.", 409);
    await sendNotification(target, "RenVer: this is a test message. Alerts will arrive here.");
    return ok({ sent: true });
  } catch (error) {
    return failFrom(error instanceof Error ? `Could not send: ${error.message}` : error, 502);
  }
}
