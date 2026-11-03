import { failFrom, ok } from "@/lib/api";
import { auditLabel } from "@/lib/audit-labels";
import { listAudit, listDatabaseRecords, listDomains, listProjects } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Recent activity, newest first. Ids are shown as names where the thing still exists. `?limit=` and `?offset=` page through it. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const asked = Number(params.get("limit"));
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

    const names = new Map<string, string>([
      ...listProjects().map((p) => [p.id, p.name] as const),
      ...listDatabaseRecords().map((d) => [d.id, d.name] as const),
      ...listDomains().map((d) => [d.id, d.name] as const),
    ]);
    const nameOf = (target: string): string => target.split("/").map((part) => names.get(part) ?? part).join(" / ");

    return ok(listAudit(limit, offset).map((entry) => ({ ...entry, label: auditLabel(entry.action), targetName: nameOf(entry.target) })));
  } catch (error) {
    return failFrom(error, 500);
  }
}
