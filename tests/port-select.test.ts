import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findFreePort, isPidAlive, isPortFree, readLock } from "../scripts/port-select.mjs";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

describe("findFreePort", () => {
  it("uses the preferred port when it is free", async () => {
    expect(await findFreePort(3000, { isFree: async () => true })).toBe(3000);
  });

  it("moves up to the next free port when the preferred one is taken", async () => {
    const taken = new Set([3000, 3001]);
    expect(await findFreePort(3000, { isFree: async (p: number) => !taken.has(p) })).toBe(3002);
  });

  it("gives up with a clear message when nothing nearby is free", async () => {
    await expect(findFreePort(3000, { isFree: async () => false, attempts: 5 })).rejects.toThrow(/3000.*3004/);
  });

  it("never goes past the highest valid port", async () => {
    await expect(findFreePort(65535, { isFree: async () => false, attempts: 5 })).rejects.toThrow();
  });
});

describe("isPortFree", () => {
  it("is false while something listens on the port and true again afterwards", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;
    expect(await isPortFree(port, "127.0.0.1")).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortFree(port, "127.0.0.1")).toBe(true);
  });
});

describe("readLock", () => {
  const dir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "renver-lock-"));
    cleanup.push(() => fs.rmSync(d, { recursive: true, force: true }));
    return d;
  };

  it("reads a lock written by a running RenVer", () => {
    const file = path.join(dir(), "lock");
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port: 3005 }));
    expect(readLock(file)).toEqual({ pid: process.pid, port: 3005 });
  });

  it("treats a missing, empty or damaged file as no lock", () => {
    const d = dir();
    expect(readLock(path.join(d, "none"))).toBeNull();
    fs.writeFileSync(path.join(d, "empty"), "");
    fs.writeFileSync(path.join(d, "junk"), "{not json");
    fs.writeFileSync(path.join(d, "wrong"), JSON.stringify({ pid: "x", port: 1 }));
    expect(readLock(path.join(d, "empty"))).toBeNull();
    expect(readLock(path.join(d, "junk"))).toBeNull();
    expect(readLock(path.join(d, "wrong"))).toBeNull();
  });
});

describe("isPidAlive", () => {
  it("knows this process is alive and a made-up one is not", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2_000_000_000)).toBe(false);
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-5)).toBe(false);
  });
});
