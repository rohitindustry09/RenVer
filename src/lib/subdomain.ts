export type SubdomainResult = { ok: true; value: string } | { ok: false; error: string };

const MAX_LABEL_LENGTH = 63;
const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const RESERVED = new Set([
  "api",
  "panel",
  "admin",
  "login",
  "mail",
  "smtp",
  "webmail",
  "ftp",
  "root",
  "dashboard",
  "status",
  "localhost",
  "ns1",
  "ns2",
]);

/** True for a single DNS label: letters, numbers and inner hyphens, up to 63 characters. */
export function isValidLabelSyntax(label: string): boolean {
  return label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label);
}

/** Turns a project name into a valid subdomain suggestion, or "" when nothing usable remains. */
export function suggestSubdomain(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/, "");
  return validateSubdomain(slug).ok ? slug : "";
}

export function validateSubdomain(input: string): SubdomainResult {
  const value = input.trim().toLowerCase();
  if (value.length === 0) return { ok: false, error: "Subdomain is required." };
  if (value.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `Subdomain must be ${MAX_LABEL_LENGTH} characters or fewer.` };
  }
  if (!LABEL_PATTERN.test(value)) {
    return {
      ok: false,
      error: "Use only letters, numbers and hyphens, not starting or ending with a hyphen.",
    };
  }
  if (RESERVED.has(value)) {
    return { ok: false, error: `"${value}" is a reserved name.` };
  }
  return { ok: true, value };
}
