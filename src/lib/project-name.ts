/** Rules for a project's display name. Client-safe and pure. The name is only a label: containers and images use a separate internal id. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_NAME_LENGTH = 80;

export function validateProjectName(input: string): Checked<string> {
  const name = input.replace(/\s+/g, " ").trim();
  if (name === "") return { ok: false, error: "Give the project a name." };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: "The name cannot contain control characters." };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Use at most ${MAX_NAME_LENGTH} characters.` };
  return { ok: true, value: name };
}
