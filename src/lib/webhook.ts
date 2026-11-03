import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";
const HEX_DIGEST = /^[0-9a-f]{64}$/i;
const BRANCH_REF_PREFIX = "refs/heads/";

/** Whether GitHub's `X-Hub-Signature-256` header proves this exact body was signed with our secret. */
export function verifyGithubSignature(secret: string, body: string | Buffer, header: string | null): boolean {
  if (!secret || !header?.startsWith(SIGNATURE_PREFIX)) return false;
  const given = header.slice(SIGNATURE_PREFIX.length);
  if (!HEX_DIGEST.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(given, "hex"));
}

/** Whether a push event is for the branch the project follows (the repository's default branch when none was chosen). */
export function pushTargetsBranch(payload: unknown, trackedBranch: string | null): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const { ref, repository } = payload as { ref?: unknown; repository?: { default_branch?: unknown } };
  if (typeof ref !== "string" || !ref.startsWith(BRANCH_REF_PREFIX)) return false;
  const pushed = ref.slice(BRANCH_REF_PREFIX.length);
  const followed = trackedBranch ?? (typeof repository?.default_branch === "string" ? repository.default_branch : null);
  return followed !== null && pushed === followed;
}
