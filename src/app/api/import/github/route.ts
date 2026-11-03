import { audited } from "@/lib/audited";
import { fail, ok } from "@/lib/api";
import { importFromGithub } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown; branch?: unknown };
    if (typeof body.url !== "string") return fail("Enter a GitHub repository URL.");
    const branch = typeof body.branch === "string" ? body.branch : null;
    return ok(await importFromGithub({ url: body.url, branch }));
  } catch (error) {
    return fail(error);
  }
}

export const POST = audited("source.import", handlePOST, { detail: (b) => (typeof b.url === "string" ? b.url : undefined) });
