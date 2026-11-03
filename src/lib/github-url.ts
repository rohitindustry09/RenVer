export type GithubUrlResult =
  | { ok: true; owner: string; repo: string; branch: string | null; cloneUrl: string; label: string }
  | { ok: false; error: string };

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,100}$/;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const ALLOWED_SCHEMES = new Set(["https", "http"]);

const fail = (error: string): GithubUrlResult => ({ ok: false, error });

export function isValidBranch(branch: string): boolean {
  return (
    BRANCH_PATTERN.test(branch) &&
    !branch.startsWith("-") &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".lock") &&
    !branch.includes("..") &&
    !branch.includes("//")
  );
}

/** Splits "scheme://host/a/b" or "host/a/b" or "owner/repo" into segments, validating the host. */
function pathSegments(input: string): { segments: string[] } | { error: string } {
  let rest = input.split(/[?#]/)[0] ?? "";
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (scheme) {
    if (!ALLOWED_SCHEMES.has(scheme[1]!.toLowerCase())) return { error: "Only https GitHub URLs are supported." };
    rest = rest.slice(scheme[0].length);
  } else if (/^[^/\s]*@/.test(rest) || rest.includes(":")) {
    return { error: "Use an https GitHub URL such as github.com/owner/repo." };
  }

  const segments = rest.split("/");
  while (segments.length > 0 && segments[segments.length - 1] === "") segments.pop();

  const first = segments[0]?.toLowerCase() ?? "";
  if (GITHUB_HOSTS.has(first)) return { segments: segments.slice(1) };
  if (scheme) return { error: "Only github.com repositories are supported." };
  return { segments };
}

export function parseGithubUrl(input: string): GithubUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return fail("Enter a GitHub repository URL.");

  const parsed = pathSegments(trimmed);
  if ("error" in parsed) return fail(parsed.error);
  const [owner, rawRepo, marker, branchSegment, ...extra] = parsed.segments;
  if (!owner || !rawRepo) return fail("Enter the repository as owner/name, for example vercel/next.js.");

  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    return fail("That does not look like a valid GitHub repository.");
  }

  let branch: string | null = null;
  if (marker !== undefined) {
    if (marker !== "tree" || !branchSegment) return fail("Paste the repository URL, or a /tree/<branch> URL.");
    if (extra.length > 0) return fail("Folders inside a repository are not supported yet. Paste the repository URL.");
    if (!isValidBranch(branchSegment)) return fail("That branch name is not valid.");
    branch = branchSegment;
  }

  return {
    ok: true,
    owner,
    repo,
    branch,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    label: `${owner}/${repo}`,
  };
}
