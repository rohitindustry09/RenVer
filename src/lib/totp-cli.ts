import { qrMatrix, renderQr } from "./qr-terminal.ts";
import { recoveryCodes } from "./recovery-codes.ts";
import { base32Decode, generateTotpSecret } from "./totp.ts";

/**
 * Usage:
 *   npm run totp                      make a new secret and show its QR code
 *   npm run totp -- --show            show the QR code for the secret already in .env (RENVER_TOTP_SECRET)
 *   npm run totp -- --recovery        list the one-time recovery codes for the secret already in .env
 *   npm run totp -- --name <name>     the name the authenticator app shows (default: admin)
 *
 * Nothing is saved. For a new secret, add the printed line to the server's settings and restart RenVer.
 */
const args = process.argv.slice(2);
const wantsRecovery = args.includes("--recovery");
const wantsExisting = args.includes("--show") || wantsRecovery;
const nameIndex = args.indexOf("--name");
const account = nameIndex >= 0 ? (args[nameIndex + 1] ?? "admin") : "admin";

function out(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

let secret: string;
if (wantsExisting) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env file: the variable may still be set in the environment */
  }
  const existing = process.env.RENVER_TOTP_SECRET?.trim();
  if (!existing) {
    out(["", "RENVER_TOTP_SECRET is not set in .env (or the environment), so there is no key to show.", "Run `npm run totp` to make a new one.", ""]);
    process.exit(1);
  }
  if (base32Decode(existing) === null) {
    out(["", "RENVER_TOTP_SECRET is set, but it is not a valid base32 key (letters A-Z and digits 2-7 only). Check the line in .env.", ""]);
    process.exit(1);
  }
  secret = existing;
} else {
  secret = generateTotpSecret();
}

if (wantsRecovery) {
  const codes = await recoveryCodes(secret);
  out([
    "",
    "Recovery codes for RenVer two-factor login",
    "",
    ...codes.map((code) => `      ${code}`),
    "",
    "Each code works once, in place of the 6-digit code, if you lose your authenticator app.",
    "Keep them in a password manager. They are made from your key, so a new key means new codes.",
    "",
  ]);
  process.exit(0);
}

const uri = `otpauth://totp/RenVer:${encodeURIComponent(account)}?secret=${secret}&issuer=RenVer&algorithm=SHA1&digits=6&period=30`;

out([
  "",
  wantsExisting ? "Two-factor login for RenVer: your current key" : "Two-factor login for RenVer: new key",
  "",
  "1. In your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden…) add an",
  "   account and SCAN THIS QR CODE:",
  "",
  renderQr(qrMatrix(uri)),
  "",
  "   Can't scan it? Choose \"enter a setup key\" in the app and type this instead:",
  "",
  `      ${secret.match(/.{1,4}/g)!.join(" ")}`,
  "",
  "   Anyone who sees this QR code or key can make your login codes. Don't screenshot it or paste it anywhere.",
  "   (If the picture looks scrambled, widen the window or use a terminal with a monospace font, like Windows Terminal.)",
  "",
  ...(wantsExisting
    ? ["2. The key is already in your settings, so there is nothing to change. Open RenVer: after the password it asks for the code.", ""]
    : [
        "2. Add this line to the server's settings (.env, or /etc/renver.env), then restart RenVer:",
        "",
        `      RENVER_TOTP_SECRET=${secret}`,
        "",
        "3. Open RenVer: after the password it asks for the 6-digit code.",
        "",
      ]),
  "Keep a copy of the key somewhere safe (a password manager). If you lose both the app and the key, remove the line from",
  "the server's settings to turn the extra step off, then run this again.",
  "",
]);
