import { describe, expect, it } from "vitest";
import { buildUnit } from "../scripts/service-unit.mjs";

const unit = buildUnit({ user: "renver", root: "/opt/renver", envPath: "/opt/renver/.env", nodePath: "/usr/bin/node" });

describe("buildUnit", () => {
  it("runs the launcher as the given user from the project folder", () => {
    expect(unit).toContain("User=renver");
    expect(unit).toContain("WorkingDirectory=/opt/renver");
    expect(unit).toContain("ExecStart=/usr/bin/node scripts/launcher.mjs start");
  });

  it("never gives up restarting, starts after Docker, and keeps secrets out of the unit", () => {
    expect(unit).toContain("StartLimitIntervalSec=0");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("After=network-online.target docker.service");
    expect(unit).not.toMatch(/PASSWORD|EnvironmentFile/);
  });
});
