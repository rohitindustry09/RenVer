// Interactive setup: asks a few questions one by one and writes the answers to .env.
//
//   npm run setup               ask the questions and write .env
//   npm run setup -- --check    only check that this machine and .env are ready to run RenVer
//
// Run it on the machine that will run RenVer (your computer, or the server after cloning the repository).
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseEnv, updateEnvText } from "./env-file.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// RENVER_ENV_FILE lets you point the wizard at another file (used by the tests).
const envPath = process.env.RENVER_ENV_FILE ? path.resolve(process.env.RENVER_ENV_FILE) : path.join(root, ".env");
const MIN_NODE_MAJOR = 22;
const GENERATED_LENGTH = 24;
const MIN_SECRET_LENGTH = 12;
const MAX_CODE_TRIES = 5;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const say = (t = "") => console.log(t);

const generate = (length = GENERATED_LENGTH) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const run = (command, args) => spawnSync(command, args, { encoding: "utf8", timeout: 20_000 });

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/** What is and is not ready on this machine. Each item: { ok: true | false | "warn", label, hint }. */
async function check(values) {
  const items = [];
  const major = Number(process.versions.node.split(".")[0]);
  const production = (values.RENVER_MODE ?? "local") === "production";
  items.push({ ok: major >= MIN_NODE_MAJOR, label: `Node.js ${process.versions.node}`, hint: `RenVer needs Node.js ${MIN_NODE_MAJOR} or newer.` });
  items.push({ ok: fs.existsSync(path.join(root, "node_modules")), label: "Packages installed", hint: "Run: npm ci" });
  items.push({ ok: fs.existsSync(path.join(root, ".next", "BUILD_ID")), label: "App built", hint: "Run: npm run build" });
  items.push({ ok: fs.existsSync(envPath), label: ".env file", hint: "Run: npm run setup" });
  items.push({
    ok: production ? Boolean(values.RENVER_ADMIN_PASSWORD) : values.RENVER_ADMIN_PASSWORD ? true : "warn",
    label: "Panel password set",
    hint: production ? "Production needs RENVER_ADMIN_PASSWORD, or the panel will not start." : "Without one, anyone who can reach the panel controls it.",
  });
  const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  items.push({ ok: docker.status === 0, label: "Docker running", hint: "Start Docker (Docker Desktop on Windows/Mac, or: sudo systemctl start docker)." });
  const caddy = run("caddy", ["version"]);
  items.push({ ok: caddy.status === 0 ? true : production ? false : "warn", label: "Caddy installed", hint: "Needed for domains and HTTPS. On a server: sudo bash scripts/install.sh" });
  const port = Number(values.RENVER_PORT || 3000);
  items.push({ ok: (await portIsFree(port)) ? true : "warn", label: `Port ${port} free`, hint: "It is taken. That is fine: RenVer picks the next free port by itself." });
  return items;
}

function printChecks(items) {
  say(bold("\nChecks"));
  for (const item of items) {
    const mark = item.ok === true ? green("[ OK ]") : item.ok === "warn" ? yellow("[WARN]") : red("[FAIL]");
    say(`${mark} ${item.label}${item.ok === true ? "" : dim(`  - ${item.hint}`)}`);
  }
  return items.every((i) => i.ok !== false);
}

const readValues = () => (fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, "utf8")) : {});

if (process.argv.includes("--check")) {
  const ok = printChecks(await check(readValues()));
  say(ok ? green("\nReady.") : red("\nFix the [FAIL] lines above, then run the check again."));
  process.exit(ok ? 0 : 1);
}

if (!process.stdin.isTTY && !process.env.RENVER_SETUP_ALLOW_PIPE) {
  console.error("npm run setup asks questions, so it needs a terminal. Edit .env by hand instead (see .env.example).");
  process.exit(1);
}

// --- prompts ----------------------------------------------------------------------------------------------------
const muted = { on: false };
const output = new Writable({
  write(chunk, _enc, done) {
    if (!muted.on) process.stdout.write(chunk);
    done();
  },
});
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
rl.on("SIGINT", () => {
  say("\nCancelled. Nothing was written.");
  process.exit(130);
});

async function ask(question, fallback = "") {
  const hint = fallback ? dim(` [${fallback}]`) : "";
  const answer = (await rl.question(`${question}${hint}: `)).trim();
  return answer || fallback;
}

async function askHidden(question) {
  process.stdout.write(`${question}: `);
  muted.on = true;
  try {
    return await rl.question("");
  } finally {
    muted.on = false;
    process.stdout.write("\n");
  }
}

async function choose(question, options, fallback = 1) {
  say(`\n${bold(question)}`);
  options.forEach((o, i) => say(`  ${i + 1}) ${o}`));
  for (;;) {
    const answer = await ask("Choose", String(fallback));
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n;
    say(yellow(`Type a number from 1 to ${options.length}.`));
  }
}

async function yes(question, fallback = false) {
  const answer = (await ask(`${question} (y/n)`, fallback ? "y" : "n")).toLowerCase();
  return answer.startsWith("y");
}

/** A typed secret, asked twice. `refuse` returns a reason to reject it, or null. */
async function askNewSecret(label, refuse = () => null) {
  for (;;) {
    const first = await askHidden(`Type the ${label} (hidden)`);
    const problem = first.length < MIN_SECRET_LENGTH ? `Use at least ${MIN_SECRET_LENGTH} characters.` : refuse(first);
    if (problem) {
      say(yellow(problem));
      continue;
    }
    if (first !== (await askHidden("Type it again"))) {
      say(yellow("They did not match. Try again."));
      continue;
    }
    return first;
  }
}

// --- the questions ----------------------------------------------------------------------------------------------
const current = readValues();
const updates = {};
const shownOnce = []; // secrets made for the user, shown a single time at the end

say(bold("\nRenVer setup"));
say(dim("Answer a few questions; they are saved to .env in this folder. Press Enter to accept the value in [brackets]. Ctrl+C cancels."));
if (fs.existsSync(envPath)) say(yellow("A .env file already exists. Your answers update it; other lines are kept, and a backup is made first."));

const where = await choose("Where will RenVer run?", ["On this computer (just for me)", "On a server (VPS) with a domain"], current.RENVER_MODE === "production" ? 2 : 1);
const production = where === 2;
updates.RENVER_MODE = production ? "production" : "local";

if (production) {
  const known = current.RENVER_BASE_DOMAIN && current.RENVER_BASE_DOMAIN !== "localhost" ? current.RENVER_BASE_DOMAIN : "";
  const domain = (await ask("\nYour domain (for example example.com)", known)).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    console.error(red("That does not look like a domain name (example: example.com). Run npm run setup again."));
    process.exit(1);
  }
  updates.RENVER_BASE_DOMAIN = domain;
  updates.RENVER_PANEL_HOST = await ask("Address of the panel itself", current.RENVER_PANEL_HOST || `panel.${domain}`);
} else {
  updates.RENVER_BASE_DOMAIN = current.RENVER_BASE_DOMAIN || "localhost";
}

updates.RENVER_ADMIN_USER = await ask("\nUsername for the sign-in page", current.RENVER_ADMIN_USER || "admin");

// Password
const passwordChoices = ["Make a strong one for me (recommended)", "I will type my own"];
if (current.RENVER_ADMIN_PASSWORD) passwordChoices.push("Keep the one already in .env");
const passwordMode = await choose("Panel password", passwordChoices, current.RENVER_ADMIN_PASSWORD ? 3 : 1);
let password = current.RENVER_ADMIN_PASSWORD ?? "";
if (passwordMode === 1) {
  password = generate();
  shownOnce.push(["Panel password", password]);
} else if (passwordMode === 2) {
  password = await askNewSecret("password");
}
updates.RENVER_ADMIN_PASSWORD = password;

// Two-factor
let totpSecret = current.RENVER_TOTP_SECRET ?? "";
const totp = await import("../src/lib/totp.ts");
if (totpSecret) {
  say(`\n${bold("Two-factor login")} is already on. ${dim("(npm run totp -- --show draws its QR code again.)")}`);
  if (await yes("Turn it off", false)) totpSecret = "";
} else if (await yes(`\n${bold("Two-factor login")}: ask for a code from an authenticator app after the password? (recommended)`, production)) {
  const { qrMatrix, renderQr } = await import("../src/lib/qr-terminal.ts");
  const candidate = totp.generateTotpSecret();
  const uri = `otpauth://totp/RenVer:${encodeURIComponent(updates.RENVER_ADMIN_USER)}?secret=${candidate}&issuer=RenVer&algorithm=SHA1&digits=6&period=30`;
  say("\nScan this with Google Authenticator, Microsoft Authenticator, Authy, 1Password or Bitwarden:\n");
  say(renderQr(qrMatrix(uri)));
  say(dim(`Cannot scan it? Enter this key by hand: ${candidate.match(/.{1,4}/g).join(" ")}`));
  for (let tries = 0; tries < MAX_CODE_TRIES && !totpSecret; tries++) {
    const code = await ask("\nType the 6-digit code now showing in the app, to prove it works (Enter to skip)");
    if (!code) break;
    const result = await totp.verifyTotp(candidate, code, Date.now(), {});
    if (result.ok) totpSecret = candidate;
    else say(yellow("That code is not right. Codes change every 30 seconds; try the new one."));
  }
  if (totpSecret) {
    const { recoveryCodes } = await import("../src/lib/recovery-codes.ts");
    shownOnce.push(["Recovery codes (each works once, if you lose the app)", (await recoveryCodes(totpSecret)).join("   ")]);
  } else {
    say(yellow("Two-factor stays off. Run npm run setup again, or npm run totp, whenever you want it."));
  }
}
updates.RENVER_TOTP_SECRET = totpSecret;

// Backup passphrase
const backupChoices = ["Make a strong one for me (recommended)", "I will type my own", "No encryption for backups"];
if (current.RENVER_BACKUP_PASSPHRASE) backupChoices.push("Keep the one already in .env");
const backupMode = await choose("Backup encryption passphrase (backups contain your encryption key, so encrypt them)", backupChoices, current.RENVER_BACKUP_PASSPHRASE ? 4 : 1);
let passphrase = current.RENVER_BACKUP_PASSPHRASE ?? "";
if (backupMode === 1) {
  passphrase = generate();
  shownOnce.push(["Backup passphrase (keep a copy OFF this machine; restoring needs it)", passphrase]);
} else if (backupMode === 2) {
  passphrase = await askNewSecret("passphrase", (value) => (value === password ? "It must differ from the panel password." : null));
} else if (backupMode === 3) {
  passphrase = "";
}
updates.RENVER_BACKUP_PASSPHRASE = passphrase;

// Allowed addresses
if (production) {
  say(dim("\nYou can limit the panel to your own IP address(es) so nobody else can even see the sign-in page."));
  const allowed = await ask("Allowed addresses, separated by commas (Enter = anyone, password still applies)", current.RENVER_ALLOWED_IPS ?? "");
  if (allowed || current.RENVER_ALLOWED_IPS) updates.RENVER_ALLOWED_IPS = allowed;
}

// --- review and write -------------------------------------------------------------------------------------------
say(bold("\nSummary"));
say(`  Runs:              ${production ? `on a server (${updates.RENVER_BASE_DOMAIN}, panel at ${updates.RENVER_PANEL_HOST})` : "on this computer"}`);
say(`  Username:          ${updates.RENVER_ADMIN_USER}`);
say(`  Password:          ${passwordMode === 3 ? "kept" : passwordMode === 1 ? "generated" : "typed by you"}`);
say(`  Two-factor:        ${totpSecret ? green("on") : yellow("off")}`);
say(`  Encrypted backups: ${passphrase ? green("on") : yellow("off")}`);
if (production && !updates.RENVER_ALLOWED_IPS) say(`  Allowed addresses: ${yellow("anyone")}`);

const { secretWarnings } = await import("../src/lib/secret-checks.ts");
for (const warning of secretWarnings({ password, passphrase: passphrase || undefined, username: updates.RENVER_ADMIN_USER })) say(yellow(`  ! ${warning.message}`));

if (!(await yes("\nWrite these to .env", true))) {
  say("Nothing was written.");
  process.exit(0);
}

let text = "";
if (fs.existsSync(envPath)) {
  text = fs.readFileSync(envPath, "utf8");
  fs.copyFileSync(envPath, `${envPath}.bak-${Date.now()}`);
} else if (fs.existsSync(path.join(root, ".env.example"))) {
  text = fs.readFileSync(path.join(root, ".env.example"), "utf8");
}
fs.writeFileSync(envPath, updateEnvText(text, updates), { mode: 0o600 });
try {
  fs.chmodSync(envPath, 0o600);
} catch {
  /* Windows has no such modes */
}
say(green("\nSaved to .env"));

if (shownOnce.length > 0) {
  say(bold("\nWrite these down NOW (a password manager is best). They are shown only this once:"));
  for (const [label, value] of shownOnce) say(`  ${label}\n    ${bold(value)}`);
}

// --- what is left ------------------------------------------------------------------------------------------------
const npm = (args) => spawnSync(`npm ${args.join(" ")}`, { cwd: root, stdio: "inherit", shell: true });
if (!fs.existsSync(path.join(root, ".next", "BUILD_ID")) && (await yes("\nBuild the app now (takes a minute or two)", true))) {
  if (!fs.existsSync(path.join(root, "node_modules"))) npm(["ci"]);
  npm(["run", "build"]);
}

if (production && process.platform === "linux" && (await yes("\nWrite a ready-made systemd service file (starts RenVer at boot, restarts it if it stops)", true))) {
  const unit = [
    "[Unit]",
    "Description=RenVer panel",
    "After=network-online.target docker.service",
    "Wants=network-online.target docker.service",
    "# Never give up restarting.",
    "StartLimitIntervalSec=0",
    "",
    "[Service]",
    "Type=simple",
    `User=${os.userInfo().username}`,
    `WorkingDirectory=${root}`,
    "Environment=NODE_ENV=production",
    `# Settings are read from ${envPath} by RenVer itself. Do not repeat them here.`,
    `ExecStart=${process.execPath} scripts/launcher.mjs start`,
    "Restart=always",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  const unitPath = path.join(root, "renver.generated.service");
  fs.writeFileSync(unitPath, unit);
  say(green(`Wrote ${unitPath}`));
  say("Install and start it with:");
  say(bold("  sudo cp renver.generated.service /etc/systemd/system/renver.service"));
  say(bold("  sudo systemctl daemon-reload && sudo systemctl enable --now renver"));
  say(dim("  Watch it:  journalctl -u renver -f"));
}

const ok = printChecks(await check(readValues()));
say(
  `\n${ok ? green("Done.") : yellow("Setup saved, but fix the [FAIL] lines above before starting.")} Start RenVer with ${bold("npm start")}${
    production ? " (or the service above)" : ""
  }, then open the address it prints and sign in as ${bold(updates.RENVER_ADMIN_USER)}.`,
);
rl.close();
