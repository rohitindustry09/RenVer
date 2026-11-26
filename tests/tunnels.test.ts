import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { parseTunnelUrl } from "@/lib/tunnel-url";
import { createTunnelManager, TunnelError, type TunnelProcess } from "@/lib/tunnels";

describe("parseTunnelUrl", () => {
  it("finds the trycloudflare address in cloudflared's log line", () => {
    const line = "2026-11-21T10:00:00Z INF |  https://quiet-river-1234.trycloudflare.com                          |";
    expect(parseTunnelUrl(line)).toBe("https://quiet-river-1234.trycloudflare.com");
  });
  it("ignores the api endpoint and unrelated lines", () => {
    expect(parseTunnelUrl("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
    expect(parseTunnelUrl("failed to request quick Tunnel: Post \"https://api.trycloudflare.com/tunnel\"")).toBeNull();
    expect(parseTunnelUrl("hello")).toBeNull();
  });
});

const REGISTERED = "INF Registered tunnel connection connIndex=0\n";

class FakeProcess extends EventEmitter implements TunnelProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill() {
    this.killed = true;
    this.emit("close", 0);
    return true;
  }
}

function manager(proc: FakeProcess, opts: { timeoutMs?: number } = {}) {
  const spawned: string[][] = [];
  const m = createTunnelManager({
    binary: () => "cloudflared",
    spawn: (_cmd, args) => {
      spawned.push(args);
      return proc;
    },
    timeoutMs: opts.timeoutMs ?? 1000,
  });
  return { m, spawned };
}

const announce = (proc: FakeProcess, url: string) => {
  proc.stderr.emit("data", Buffer.from(`INF |  ${url}  |\n`));
  proc.stderr.emit("data", Buffer.from(REGISTERED));
};

describe("tunnel manager", () => {
  it("starts a tunnel to the app's local port and reports the url", async () => {
    const proc = new FakeProcess();
    const { m, spawned } = manager(proc);
    const pending = m.start("p1", 4001);
    announce(proc, "https://a-b-c.trycloudflare.com");
    expect(await pending).toBe("https://a-b-c.trycloudflare.com");
    expect(spawned[0]).toEqual(expect.arrayContaining(["tunnel", "--url", "http://127.0.0.1:4001"]));
    expect(m.get("p1")).toEqual({ url: "https://a-b-c.trycloudflare.com" });
  });

  it("returns the existing url instead of starting a second tunnel", async () => {
    const proc = new FakeProcess();
    const { m, spawned } = manager(proc);
    const first = m.start("p1", 4001);
    announce(proc, "https://x.trycloudflare.com");
    await first;
    expect(await m.start("p1", 4001)).toBe("https://x.trycloudflare.com");
    expect(spawned).toHaveLength(1);
  });

  it("stops the process and forgets the url", async () => {
    const proc = new FakeProcess();
    const { m } = manager(proc);
    const p = m.start("p1", 4001);
    announce(proc, "https://x.trycloudflare.com");
    await p;
    m.stop("p1");
    expect(proc.killed).toBe(true);
    expect(m.get("p1")).toBeNull();
  });

  it("forgets the tunnel when the process exits by itself", async () => {
    const proc = new FakeProcess();
    const { m } = manager(proc);
    const p = m.start("p1", 4001);
    announce(proc, "https://x.trycloudflare.com");
    await p;
    proc.emit("close", 1);
    expect(m.get("p1")).toBeNull();
  });

  it("does not report the address until the tunnel has connected", async () => {
    const proc = new FakeProcess();
    const { m } = manager(proc);
    const pending = m.start("p1", 4001);
    let settled = false;
    void pending.then(() => (settled = true));
    proc.stderr.emit("data", Buffer.from("https://early.trycloudflare.com\n"));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    expect(m.get("p1")).toBeNull();
    proc.stderr.emit("data", Buffer.from(REGISTERED));
    expect(await pending).toBe("https://early.trycloudflare.com");
  });

  it("fails clearly when no url appears in time and cleans up", async () => {
    const proc = new FakeProcess();
    const { m } = manager(proc, { timeoutMs: 20 });
    await expect(m.start("p1", 4001)).rejects.toBeInstanceOf(TunnelError);
    expect(proc.killed).toBe(true);
    expect(m.get("p1")).toBeNull();
  });

  it("explains a missing cloudflared binary", async () => {
    const proc = new FakeProcess();
    const { m } = manager(proc);
    const p = m.start("p1", 4001);
    proc.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    await expect(p).rejects.toThrow(/cloudflared is not installed/i);
  });
});
