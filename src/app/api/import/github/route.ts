import { fail, ok } from "@/lib/api";
import { importFromGithub } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown; branch?: unknown };
    if (typeof body.url !== "string") return fail("Enter a GitHub repository URL.");
    const branch = typeof body.branch === "string" ? body.branch : null;
    return ok(await importFromGithub({ url: body.url, branch }));
  } catch (error) {
    return fail(error);
  }
}
