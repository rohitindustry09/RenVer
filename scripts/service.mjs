// Makes RenVer start at boot and restart if it stops, on a Linux server (systemd).
//
//   npm run service        writes renver.generated.service here and prints the commands that install it
//
// Run it as the user that owns this folder and can use Docker (not with sudo): the service runs as that user.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnit } from "./service-unit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bold = (t) => `\x1b[1m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const say = (t = "") => console.log(t);

if (process.platform !== "linux") {
  console.error("This sets up a systemd service, which only exists on Linux. On Windows use scripts/autostart.ps1.");
  process.exit(1);
}

const user = process.env.SUDO_USER || os.userInfo().username;
const envPath = path.join(root, ".env");
const unitPath = path.join(root, "renver.generated.service");

if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) say(yellow("The app is not built yet. Run: npm run build"));
if (!fs.existsSync(envPath)) say(yellow("There is no .env yet. Run: npm run setup"));

const groups = spawnSync("id", ["-nG", user], { encoding: "utf8" }).stdout ?? "";
if (user !== "root" && !groups.split(/\s+/).includes("docker")) {
  say(yellow(`The user "${user}" is not in the docker group, so RenVer could not start containers. Fix it with:  sudo usermod -aG docker ${user}  (then log in again)`));
}

fs.writeFileSync(unitPath, buildUnit({ user, root, envPath, nodePath: process.execPath }));
say(`Wrote ${unitPath}\n`);
say("Install it and start RenVer now (and at every boot) with:\n");
say(bold("  sudo cp renver.generated.service /etc/systemd/system/renver.service"));
say(bold("  sudo systemctl daemon-reload"));
say(bold("  sudo systemctl enable --now renver"));
say("\nThen:");
say("  sudo systemctl status renver --no-pager     is it running?");
say("  journalctl -u renver -n 40 --no-pager       why not?");
say("  sudo systemctl restart renver               after an update");
say("\nIf RenVer is already running from a terminal (npm start), stop that one first (Ctrl+C), or the service will say it is already running.");
