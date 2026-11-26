import { describe, expect, it } from "vitest";
import { CloudflareError, createCloudflareClient } from "@/lib/cloudflare-api";

interface Call {
  url: string;
  method: string;
  body: unknown;
  auth: string | null;
}

function fakeFetch(responses: unknown[], status = 200) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      auth: headers.get("authorization"),
    });
    const next = responses.shift();
    return new Response(JSON.stringify(next), { status });
  };
  return { impl, calls };
}

const ok = (result: unknown) => ({ success: true, errors: [], result });

describe("cloudflare client", () => {
  it("verifies a token and sends it as a bearer header", async () => {
    const { impl, calls } = fakeFetch([ok({ status: "active" })]);
    await createCloudflareClient("tok", impl).verifyToken();
    expect(calls[0]).toMatchObject({ url: "https://api.cloudflare.com/client/v4/user/tokens/verify", auth: "Bearer tok" });
  });

  it("rejects an inactive token", async () => {
    const { impl } = fakeFetch([ok({ status: "expired" })]);
    await expect(createCloudflareClient("tok", impl).verifyToken()).rejects.toThrow(/not active|expired/i);
  });

  it("finds a zone by name with its account and nameservers", async () => {
    const { impl, calls } = fakeFetch([
      ok([{ id: "z1", name: "domain.com", status: "active", account: { id: "a1" }, name_servers: ["a.ns.cloudflare.com", "b.ns.cloudflare.com"] }]),
    ]);
    const zone = await createCloudflareClient("tok", impl).findZone("domain.com");
    expect(zone).toEqual({ id: "z1", name: "domain.com", status: "active", accountId: "a1", nameServers: ["a.ns.cloudflare.com", "b.ns.cloudflare.com"] });
    expect(calls[0]!.url).toContain("/zones?name=domain.com");
  });

  it("returns null when the account has no such zone", async () => {
    const { impl } = fakeFetch([ok([])]);
    expect(await createCloudflareClient("tok", impl).findZone("nope.com")).toBeNull();
  });

  it("creates a Cloudflare-managed tunnel and reads its run token", async () => {
    const { impl, calls } = fakeFetch([ok({ id: "t1" }), ok("run-token")]);
    const client = createCloudflareClient("tok", impl);
    expect(await client.createTunnel("a1", "renver")).toBe("t1");
    expect(calls[0]).toMatchObject({ method: "POST", url: expect.stringContaining("/accounts/a1/cfd_tunnel") });
    expect(calls[0]!.body).toEqual({ name: "renver", config_src: "cloudflare" });
    expect(await client.getTunnelToken("a1", "t1")).toBe("run-token");
    expect(calls[1]!.url).toContain("/accounts/a1/cfd_tunnel/t1/token");
  });

  it("replaces the tunnel's ingress rules", async () => {
    const { impl, calls } = fakeFetch([ok({})]);
    await createCloudflareClient("tok", impl).putIngress("a1", "t1", [{ hostname: "x.domain.com", service: "http://127.0.0.1:4001" }, { service: "http_status:404" }]);
    expect(calls[0]).toMatchObject({ method: "PUT", url: expect.stringContaining("/accounts/a1/cfd_tunnel/t1/configurations") });
    expect(calls[0]!.body).toEqual({ config: { ingress: [{ hostname: "x.domain.com", service: "http://127.0.0.1:4001" }, { service: "http_status:404" }] } });
  });

  it("creates a proxied CNAME and lists and deletes records", async () => {
    const { impl, calls } = fakeFetch([ok({ id: "r1" }), ok([{ id: "r1", type: "CNAME", name: "x.domain.com", content: "t1.cfargotunnel.com" }]), ok({ id: "r1" })]);
    const client = createCloudflareClient("tok", impl);
    expect(await client.createCname("z1", "x.domain.com", "t1.cfargotunnel.com")).toBe("r1");
    expect(calls[0]!.body).toMatchObject({ type: "CNAME", name: "x.domain.com", content: "t1.cfargotunnel.com", proxied: true });
    expect(await client.listRecords("z1", "x.domain.com")).toHaveLength(1);
    expect(calls[1]!.url).toContain("/zones/z1/dns_records?name=x.domain.com");
    await client.deleteRecord("z1", "r1");
    expect(calls[2]).toMatchObject({ method: "DELETE", url: expect.stringContaining("/zones/z1/dns_records/r1") });
  });

  it("explains a rejected token", async () => {
    const { impl } = fakeFetch([{ success: false, errors: [{ code: 9109, message: "Invalid access token" }], result: null }], 403);
    const error = await createCloudflareClient("tok", impl).findZone("d.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CloudflareError);
    expect((error as Error).message).toMatch(/Invalid access token/);
    expect((error as Error).message).toMatch(/permission/i);
  });

  it("explains a network failure", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    await expect(createCloudflareClient("tok", failing).findZone("d.com")).rejects.toThrow(/reach Cloudflare/i);
  });
});
