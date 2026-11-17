import { secretWarnings } from "./secret-checks";

/** What a person fills in to create a WordPress website. Client-safe and pure: the form and the server use the same rules. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WordPressInput {
  title: string;
  adminUser: string;
  adminEmail: string;
  adminPassword: string;
  /** A WordPress language code, one of WP_LANGUAGES. */
  language: string;
  /** False asks search engines not to list the site (WordPress' own "discourage search engines" setting). */
  indexable: boolean;
}

export const WP_LANGUAGES: { code: string; label: string }[] = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi_IN", label: "हिन्दी (Hindi)" },
  { code: "es_ES", label: "Español" },
  { code: "fr_FR", label: "Français" },
  { code: "de_DE", label: "Deutsch" },
  { code: "pt_BR", label: "Português do Brasil" },
  { code: "it_IT", label: "Italiano" },
  { code: "nl_NL", label: "Nederlands" },
  { code: "ru_RU", label: "Русский" },
  { code: "tr_TR", label: "Türkçe" },
  { code: "ar", label: "العربية" },
  { code: "id_ID", label: "Bahasa Indonesia" },
  { code: "ja", label: "日本語" },
  { code: "zh_CN", label: "简体中文" },
];

export const MAX_TITLE_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const USERNAME = /^[A-Za-z0-9_.@-]{3,60}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function validateWordPressInput(raw: unknown): Checked<WordPressInput> {
  const body = (raw ?? {}) as Record<string, unknown>;

  const title = text(body.title).replace(/\s+/g, " ").trim();
  if (title === "") return { ok: false, error: "Give the website a title." };
  if (CONTROL.test(title) || title.length > MAX_TITLE_LENGTH) return { ok: false, error: `The title can have at most ${MAX_TITLE_LENGTH} characters and no control characters.` };

  const adminUser = text(body.adminUser).trim();
  if (!USERNAME.test(adminUser)) return { ok: false, error: "The admin username needs 3 to 60 characters: letters, numbers and . _ - @ only." };

  const adminEmail = text(body.adminEmail).trim();
  if (!EMAIL.test(adminEmail) || adminEmail.length > 100) return { ok: false, error: "Enter a valid admin email address." };

  const adminPassword = text(body.adminPassword);
  if (adminPassword.length > MAX_PASSWORD_LENGTH || CONTROL.test(adminPassword)) return { ok: false, error: `The password can have at most ${MAX_PASSWORD_LENGTH} characters, with no line breaks.` };
  // Anyone on the internet can try this login, so a weak password is refused, not just warned about.
  const weak = secretWarnings({ password: adminPassword, username: adminUser })[0];
  if (weak) return { ok: false, error: weak.message.replace("The panel password", "The admin password") };
  if (adminPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.` };

  const language = text(body.language) || "en_US";
  if (!WP_LANGUAGES.some((l) => l.code === language)) return { ok: false, error: "Pick one of the listed languages." };

  return { ok: true, value: { title, adminUser, adminEmail, adminPassword, language, indexable: body.indexable !== false } };
}

/** A random password with no look-alike characters. `random(n)` returns an integer from 0 to n - 1 (the form passes a crypto source). */
export function generateAdminPassword(random: (below: number) => number, length = 20): string {
  return Array.from({ length }, () => PASSWORD_ALPHABET[random(PASSWORD_ALPHABET.length)]).join("");
}
