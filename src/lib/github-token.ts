/** Rules for the GitHub access token that lets RenVer read private repositories. Client-safe and pure. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Classic tokens start with ghp_, fine-grained ones with github_pat_. */
const TOKEN = /^(ghp_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})$/;

export function validateGithubToken(input: string): Checked<string> {
  const token = input.trim();
  if (token === "") return { ok: false, error: "Paste your GitHub token." };
  if (/\s/.test(token)) return { ok: false, error: "A token has no spaces or line breaks. Copy it again from GitHub." };
  if (!TOKEN.test(token)) {
    return { ok: false, error: "That does not look like a GitHub token. It starts with github_pat_ (fine-grained) or ghp_ (classic)." };
  }
  return { ok: true, value: token };
}

/** Removes a token from text that is about to be shown or logged. */
export function redactToken(text: string, token: string | null): string {
  const hidden = token ? text.split(token).join("***") : text;
  return hidden.replace(/\b(ghp_|github_pat_|gho_|ghs_|ghu_)[A-Za-z0-9_]+/g, "***");
}
