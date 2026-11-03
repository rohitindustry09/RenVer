import { evaluate, summarize, type CheckStatus } from "./preflight.ts";
import { collectSystemInfo } from "./system-info.ts";

const ICONS: Record<CheckStatus, string> = {
  ok: "[ OK ]",
  warn: "[WARN]",
  missing: "[MISS]",
  fail: "[FAIL]",
};

const info = await collectSystemInfo();
const checks = evaluate(info);
const summary = summarize(checks);

process.stdout.write("\nRenVer preflight\n\n");
for (const c of checks) {
  process.stdout.write(`${ICONS[c.status]} ${c.label.padEnd(18)} ${c.message}\n`);
}

if (summary.toInstall.length > 0) {
  process.stdout.write(`\nWill need to install: ${summary.toInstall.join(", ")}\n`);
}
process.stdout.write(
  summary.canInstall
    ? "\nResult: ready to install.\n"
    : `\nResult: blocked by ${summary.failures.join(", ")}.\n`,
);
process.exit(summary.canInstall ? 0 : 1);
