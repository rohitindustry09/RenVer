import { fail, ok } from "@/lib/api";
import { validateBackupTime } from "@/lib/backup-schedule";
import { describeSchedule } from "@/lib/backup-schedule-view";
import { getBackupSchedule, saveBackupSchedule } from "@/lib/runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok(describeSchedule());
}

/** Turns automatic backups on or off and sets the time of day (server time). */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { enabled?: unknown; time?: unknown };
    const current = getBackupSchedule();
    const time = validateBackupTime(typeof body.time === "string" ? body.time : current.time);
    if (!time.ok) return fail(time.error, 400);
    saveBackupSchedule({ enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled, time: time.value });
    return ok(describeSchedule());
  } catch (error) {
    return fail(error, 500);
  }
}
