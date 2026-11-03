import { describe, expect, it } from "vitest";
import { buildCaddyConfig } from "@/lib/caddy";

const local = [
  { hosts: ["shop1.localhost"], port: 4001 },
  { hosts: ["shop2.localhost"], port: 4002 },
];

const main = (routes: Parameters<typeof buildCaddyConfig>[0], options?: Parameters<typeof buildCaddyConfig>[1]) =>
  buildCaddyConfig(routes, options).apps.http.servers.main;

describe("buildCaddyConfig routes", () => {
  it("creates one host-matched reverse proxy route per app", () => {
    const routes = main(local).routes;
    expect(routes).toHaveLength(3);
    expect(routes[0]!.match![0]!.host).toEqual(["shop1.localhost"]);
    expect(routes[0]!.handle[0]!.upstreams![0]!.dial).toBe("127.0.0.1:4001");
    expect(routes[1]!.handle[0]!.upstreams![0]!.dial).toBe("127.0.0.1:4002");
  });

  it("sends several hostnames of one app to the same upstream", () => {
    const routes = main([{ hosts: ["example.com", "www.example.com", "shop.example.com"], port: 4005 }]).routes;
    expect(routes).toHaveLength(2);
    expect(routes[0]!.match![0]!.host).toEqual(["example.com", "www.example.com", "shop.example.com"]);
  });

  it("ends with a 404 fallback for unknown hosts", () => {
    const last = main(local).routes.at(-1)!;
    expect(last.handle[0]!.status_code).toBe(404);
  });

  it("puts the panel route first when given", () => {
    const first = main(local, { panel: { hosts: ["panel.localhost"], port: 3000 } }).routes[0]!;
    expect(first.match![0]!.host).toEqual(["panel.localhost"]);
    expect(first.handle[0]!.upstreams![0]!.dial).toBe("127.0.0.1:3000");
  });

  it("skips apps that have no hostnames", () => {
    expect(main([{ hosts: [], port: 4009 }]).routes).toHaveLength(1);
  });
});

describe("buildCaddyConfig HTTPS", () => {
  it("serves only local hosts over plain http on :80 with HTTPS disabled", () => {
    const server = main(local);
    expect(server.listen).toEqual([":80"]);
    expect(server.automatic_https.disable).toBe(true);
  });

  it("serves an empty config on :80 without HTTPS", () => {
    const server = main([]);
    expect(server.listen).toEqual([":80"]);
    expect(server.automatic_https.disable).toBe(true);
  });

  it("turns on automatic HTTPS on :80 and :443 as soon as a real domain is routed", () => {
    const server = main([{ hosts: ["shop.example.com"], port: 4001 }]);
    expect(server.listen).toEqual([":80", ":443"]);
    expect(server.automatic_https.disable).toBe(false);
  });

  it("keeps local hosts on plain http when mixed with real domains", () => {
    const server = main([
      { hosts: ["shop.example.com"], port: 4001 },
      { hosts: ["dev.localhost", "other.localhost"], port: 4002 },
    ]);
    expect(server.automatic_https.skip).toEqual(["dev.localhost", "other.localhost"]);
  });

  it("does not list a skip entry when there are no local hosts", () => {
    expect(main([{ hosts: ["a.example.com"], port: 4001 }]).automatic_https.skip).toBeUndefined();
  });
});
