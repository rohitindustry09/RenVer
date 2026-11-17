import { audited } from "@/lib/audited";
import { failFrom, ok, publicProject } from "@/lib/api";
import { DatabaseError } from "@/lib/databases";
import { DomainError } from "@/lib/domains";
import { createWordPressSite } from "@/lib/wordpress-site";
import { validateWordPressInput } from "@/lib/wordpress-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = validateWordPressInput(body);
    if (!input.ok) throw new DomainError(input.error);
    const { project, deployId } = createWordPressSite(input.value, {
      domainId: String(body.domainId ?? ""),
      label: typeof body.label === "string" ? body.label : "",
    });
    return ok({ project: publicProject(project), deployId }, 202);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return failFrom(new DomainError("That address is already in use.", 409));
    if (error instanceof DatabaseError) return failFrom(new DomainError(error.message, error.status));
    return failFrom(error);
  }
}

export const POST = audited("website.create", handlePOST);
