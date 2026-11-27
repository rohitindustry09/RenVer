import { describe, expect, it, vi } from "vitest";
import { CloudflareError, type CloudflareClient, type Zone } from "@/lib/cloudflare-api";
import { createCloudflareService, type CloudflareStore } from "@/lib/cloudflare";

function memoryStore(): CloudflareStore {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => (v === null ? data.delete(k) : data.set(k, v)) };
}

const zone = (over: Partial<Zone> = {}): Zone => ({ id: "z1", name: "domain.com", status: "active", accountId: "a1", nameServers: ["a.ns.cloudflare.com", "b.ns.cloudflare.com"], ...over });

function setup(opts: { zone?: Zone | null; records?: Record<string, { id: string; type: string; name: string; content: string }[]>; panelHost?: string | null; protectedPanel?: boolean } = {}) {
  const calls: string[] = [];
  const records = opts.records ?? {};
  const client = {
    verifyToken: vi.fn(async () => void calls.push("verify")),
    findZone: vi.fn(async () => (opts.zone === undefined ? zone() : opts.zone)),
    createTunnel: vi.fn(async () => (calls.push("createTunnel"), "t1")),
    findTunnel: vi.fn(async () => null as string | null),
    getTunnelToken: vi.fn(async () => "run-token"),
    deleteTunnel: vi.fn(async () => void calls.push("deleteTunnel")),
    putIngress: vi.fn(async () => void calls.push("putIngress")),
    listRecords: vi.fn(async (_z: string, name: string) => records[name] ?? []),
    createCname: vi.fn(async (_z: string, name: string) => (calls.push(`create ${name}`), `rec-${name}`)),
    deleteRecord: vi.fn(async (_z: string, id: string) => void calls.push(`delete ${id}`)),
  } satisfies CloudflareClient;
  const runner = { start: vi.fn(), stop: vi.fn(), state: () => ({ running: true, connected: true, error: null }) };
  const verified: string[] = [];
  let hosts: Record<string, string[]> = {};
  let routes: { hosts: string[]; port: number }[] = [];
  const store = memoryStore();
  const service = createCloudflareService({
    store,
    client: () => client,
    runner,
    domains: {
      get: (id) => (id === "d1" ? { id: "d1", name: "domain.com", isLocal: false } : id === "loc" ? { id: "loc", name: "app.localhost", isLocal: true } : null),
      hosts: (id) => hosts[id] ?? [],
      runningRoutes: () => routes,
      markVerified: (id) => void verified.push(id),
    },
    panel: { host: () => (opts.panelHost === undefined ? null : opts.panelHost), port: () => 3000, isProtected: () => opts.protectedPanel ?? true },
    encrypt: (v) => JSON.stringify(v),
    decrypt: (s) => (s ? (JSON.parse(s) as Record<string, string>) : {}),
  });
  return { service, client, runner, store, calls, verified, setHosts: (h: typeof hosts) => (hosts = h), setRoutes: (r: typeof routes) => (routes = r) };
}

describe("saving the token", () => {
  it("checks the token with Cloudflare before keeping it", async () => {
    const { service, client } = setup();
    await service.saveToken("  tok  ");
    expect(client.verifyToken).toHaveBeenCalled();
    expect(service.status().hasToken).toBe(true);
  });

  it("rejects an empty token", async () => {
    const { service } = setup();
    await expect(service.saveToken("   ")).rejects.toThrow(/token/i);
  });
});

describe("connecting a domain", () => {
  it("needs a token first", async () => {
    const { service } = setup();
    await expect(service.connectDomain("d1")).rejects.toThrow(/token/i);
  });

  it("refuses local domains", async () => {
    const { service } = setup();
    await service.saveToken("tok");
    await expect(service.connectDomain("loc")).rejects.toThrow(/local/i);
  });

  it("explains a domain that is not on this Cloudflare account", async () => {
    const { service } = setup({ zone: null });
    await service.saveToken("tok");
    await expect(service.connectDomain("d1")).rejects.toThrow(/add (it|the site)|not on/i);
  });

  it("shows the nameservers to set while the zone is still pending", async () => {
    const { service } = setup({ zone: zone({ status: "pending" }) });
    await service.saveToken("tok");
    await expect(service.connectDomain("d1")).rejects.toThrow(/a\.ns\.cloudflare\.com/);
  });

  it("creates the tunnel once, starts it, verifies the domain and syncs", async () => {
    const { service, client, runner, verified, calls } = setup();
    await service.saveToken("tok");
    await service.connectDomain("d1");
    expect(client.createTunnel).toHaveBeenCalledTimes(1);
    expect(runner.start).toHaveBeenCalledWith("run-token");
    expect(verified).toEqual(["d1"]);
    expect(calls).toContain("putIngress");
    expect(service.isCloudflareDomain("d1")).toBe(true);
    await service.connectDomain("d1");
    expect(client.createTunnel).toHaveBeenCalledTimes(1);
  });
});

describe("an existing tunnel with the same name", () => {
  const taken = () => new CloudflareError("Cloudflare: You already have a tunnel with this name. Delete the existing tunnel, or choose a different name for your new tunnel");

  it("creates a tunnel named renver", async () => {
    const { service, client } = setup();
    await service.saveToken("tok");
    await service.connectDomain("d1");
    expect(client.createTunnel).toHaveBeenCalledWith("a1", "renver");
  });

  it("takes it over: reuses it, runs it and replaces its routes", async () => {
    const { service, client, runner } = setup();
    client.createTunnel.mockRejectedValueOnce(taken());
    client.findTunnel.mockResolvedValueOnce("t-old");
    await service.saveToken("tok");
    await service.connectDomain("d1");
    expect(client.createTunnel).toHaveBeenCalledTimes(1);
    expect(client.findTunnel).toHaveBeenCalledWith("a1", "renver");
    expect(client.getTunnelToken).toHaveBeenCalledWith("a1", "t-old");
    expect(runner.start).toHaveBeenCalledWith("run-token");
    expect(client.putIngress).toHaveBeenCalledWith("a1", "t-old", expect.any(Array));
    expect(service.status().tunnel).toBe(true);
  });

  it("reports the original problem if the tunnel cannot be found", async () => {
    const { service, client } = setup();
    client.createTunnel.mockRejectedValue(taken());
    await service.saveToken("tok");
    await expect(service.connectDomain("d1")).rejects.toThrow(/already have a tunnel/i);
  });

  it("does not adopt anything for other errors", async () => {
    const { service, client } = setup();
    client.createTunnel.mockRejectedValue(new CloudflareError("Cloudflare refused the request (permission)."));
    await service.saveToken("tok");
    await expect(service.connectDomain("d1")).rejects.toThrow(/refused/);
    expect(client.findTunnel).not.toHaveBeenCalled();
  });
});

describe("syncing", () => {
  async function connected(opts?: Parameters<typeof setup>[0]) {
    const ctx = setup(opts);
    await ctx.service.saveToken("tok");
    await ctx.service.connectDomain("d1");
    ctx.calls.length = 0;
    return ctx;
  }

  it("routes running apps to their ports and adds DNS records for every address", async () => {
    const ctx = await connected();
    ctx.setHosts({ d1: ["shop.domain.com", "blog.domain.com"] });
    ctx.setRoutes([{ hosts: ["shop.domain.com"], port: 4001 }]);
    const result = await ctx.service.sync();
    expect(ctx.client.putIngress).toHaveBeenLastCalledWith("a1", "t1", [
      { hostname: "shop.domain.com", service: "http://127.0.0.1:4001" },
      { service: "http_status:404" },
    ]);
    expect(ctx.calls).toEqual(expect.arrayContaining(["create shop.domain.com", "create blog.domain.com"]));
    expect(result.errors).toEqual([]);
  });

  it("removes only the records RenVer made when an address goes away", async () => {
    const ctx = await connected();
    ctx.setHosts({ d1: ["shop.domain.com"] });
    await ctx.service.sync();
    ctx.calls.length = 0;
    ctx.setHosts({ d1: [] });
    await ctx.service.sync();
    expect(ctx.calls).toContain("delete rec-shop.domain.com");
  });

  it("does not create a record twice", async () => {
    const ctx = await connected();
    ctx.setHosts({ d1: ["shop.domain.com"] });
    await ctx.service.sync();
    ctx.calls.length = 0;
    await ctx.service.sync();
    expect(ctx.calls.filter((c) => c.startsWith("create"))).toEqual([]);
  });

  it("adopts a matching record that already exists", async () => {
    const ctx = await connected({ records: { "shop.domain.com": [{ id: "old", type: "CNAME", name: "shop.domain.com", content: "t1.cfargotunnel.com" }] } });
    ctx.setHosts({ d1: ["shop.domain.com"] });
    const result = await ctx.service.sync();
    expect(ctx.client.createCname).not.toHaveBeenCalled();
    expect(result.errors).toEqual([]);
  });

  it("never overwrites someone else's record and says so", async () => {
    const ctx = await connected({ records: { "shop.domain.com": [{ id: "x", type: "A", name: "shop.domain.com", content: "1.2.3.4" }] } });
    ctx.setHosts({ d1: ["shop.domain.com", "blog.domain.com"] });
    const result = await ctx.service.sync();
    expect(result.errors.join(" ")).toMatch(/shop\.domain\.com.*already/i);
    expect(ctx.calls).toContain("create blog.domain.com");
    expect(ctx.calls).not.toContain("delete x");
  });

  it("does nothing when Cloudflare is not set up", async () => {
    const ctx = setup();
    expect(await ctx.service.sync()).toEqual({ skipped: true, errors: [] });
    expect(ctx.client.putIngress).not.toHaveBeenCalled();
  });
});

describe("the panel's own address", () => {
  async function connected(opts: Parameters<typeof setup>[0]) {
    const ctx = setup(opts);
    await ctx.service.saveToken("tok");
    await ctx.service.connectDomain("d1");
    ctx.calls.length = 0;
    return ctx;
  }

  it("is routed to the panel's port and gets a DNS record when it is on a Cloudflare domain", async () => {
    const ctx = await connected({ panelHost: "panel.domain.com" });
    const result = await ctx.service.sync();
    expect(ctx.client.putIngress).toHaveBeenLastCalledWith("a1", "t1", [
      { hostname: "panel.domain.com", service: "http://127.0.0.1:3000" },
      { service: "http_status:404" },
    ]);
    expect(ctx.client.createCname).toHaveBeenCalledWith("z1", "panel.domain.com", "t1.cfargotunnel.com");
    expect(result.errors).toEqual([]);
  });

  it("is never put on the internet without an admin password", async () => {
    const ctx = await connected({ panelHost: "panel.domain.com", protectedPanel: false });
    const result = await ctx.service.sync();
    expect(ctx.client.putIngress).toHaveBeenLastCalledWith("a1", "t1", [{ service: "http_status:404" }]);
    expect(ctx.client.createCname).not.toHaveBeenCalled();
    expect(result.errors.join(" ")).toMatch(/password/i);
  });

  it("is left alone when it is on a domain that is not served through Cloudflare", async () => {
    const ctx = await connected({ panelHost: "panel.other.org" });
    const result = await ctx.service.sync();
    expect(ctx.client.putIngress).toHaveBeenLastCalledWith("a1", "t1", [{ service: "http_status:404" }]);
    expect(result.errors).toEqual([]);
  });

  it("is recognised as a Cloudflare hostname so Caddy skips it", async () => {
    const ctx = await connected({});
    expect(ctx.service.isCloudflareHost("panel.domain.com")).toBe(true);
    expect(ctx.service.isCloudflareHost("domain.com")).toBe(true);
    expect(ctx.service.isCloudflareHost("panel.other.org")).toBe(false);
  });
});

describe("proxy routes", () => {
  it("leaves Cloudflare hostnames out of Caddy so it does not chase certificates for them", async () => {
    const ctx = setup();
    await ctx.service.saveToken("tok");
    await ctx.service.connectDomain("d1");
    ctx.setRoutes([
      { hosts: ["shop.domain.com", "x.localhost"], port: 4001 },
      { hosts: ["blog.domain.com"], port: 4002 },
    ]);
    expect(ctx.service.proxyRoutes()).toEqual([{ hosts: ["x.localhost"], port: 4001 }]);
  });
});

describe("disconnecting", () => {
  it("stops the tunnel, removes RenVer's DNS records and forgets everything", async () => {
    const ctx = setup();
    await ctx.service.saveToken("tok");
    await ctx.service.connectDomain("d1");
    ctx.setHosts({ d1: ["shop.domain.com"] });
    await ctx.service.sync();
    ctx.calls.length = 0;
    await ctx.service.disconnect();
    expect(ctx.runner.stop).toHaveBeenCalled();
    expect(ctx.calls).toEqual(expect.arrayContaining(["delete rec-shop.domain.com", "deleteTunnel"]));
    expect(ctx.service.status()).toMatchObject({ hasToken: false, tunnel: false });
    expect(ctx.service.isCloudflareDomain("d1")).toBe(false);
  });
});
