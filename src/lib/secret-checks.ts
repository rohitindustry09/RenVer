/** Spots weak or reused secrets without ever repeating them. Pure, so it is easy to test. */

export interface SecretWarning {
  id: string;
  message: string;
}

const MIN_LENGTH = 12;
/** The usual first guesses. Matched after stripping spaces and punctuation and lower-casing. */
const COMMON = ["password", "passw0rd", "admin", "administrator", "changeme", "letmein", "welcome", "qwerty", "qwertyuiop", "iloveyou", "123456", "abc123", "renver", "root", "secret", "default"];

/** Longer words first, so "administrator" is not cut up as "admin" + "istrator". */
const LONGEST_FIRST = [...COMMON].sort((a, b) => b.length - a.length);

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Mostly one repeated character, or a plain run of digits: long, but still guessable. */
function isLazyPattern(text: string): boolean {
  const s = squash(text);
  return s.length > 0 && (new Set(s).size <= 3 || /^\d+$/.test(s));
}

function isCommon(text: string): boolean {
  const s = squash(text);
  if (isLazyPattern(text)) return true;
  // A password made only of common words and digits ("changemechangeme", "password1234").
  const remainder = LONGEST_FIRST.reduce((rest, word) => rest.split(word).join(""), s).replace(/\d/g, "");
  return remainder.length === 0;
}

export function secretWarnings(input: { password: string | undefined; passphrase?: string | undefined; username: string }): SecretWarning[] {
  const warnings: SecretWarning[] = [];
  const { password, passphrase, username } = input;

  if (password) {
    if (password.length < MIN_LENGTH) {
      warnings.push({ id: "password-short", message: `The panel password is short (${password.length} characters). Use ${MIN_LENGTH} or more.` });
    }
    if (isCommon(password)) {
      warnings.push({ id: "password-common", message: "The panel password is a common or easy-to-guess one. Use a long random value." });
    }
    if (username && squash(password).includes(squash(username))) {
      warnings.push({ id: "password-username", message: "The panel password contains the username. Pick one that does not." });
    }
  }

  if (passphrase) {
    if (password && passphrase === password) {
      warnings.push({ id: "passphrase-reused", message: "The backup passphrase is the same as the panel password. Use a different one, so a single leak does not open both." });
    }
    if (passphrase.length < MIN_LENGTH) {
      warnings.push({ id: "passphrase-short", message: `The backup passphrase is short (${passphrase.length} characters). Use ${MIN_LENGTH} or more.` });
    }
  }
  return warnings;
}
