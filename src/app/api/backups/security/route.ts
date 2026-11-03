import { ok } from "@/lib/api";
import { backupPassphrase } from "@/lib/backup-passphrase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether new backups are being encrypted. The passphrase itself is never sent anywhere. */
export async function GET() {
  return ok({ isEncrypting: backupPassphrase() !== undefined });
}
