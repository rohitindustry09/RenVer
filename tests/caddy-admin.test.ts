import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { applyCaddyConfig, buildCaddyConfig, isCaddyRunning } from "@/lib/caddy";

let server: http.Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

/** A stand-in for Caddy 2.11's admin API: it rejects browser-style requests (Sec-Fetch-* headers). */
async function startFakeCaddy(onLoad: (body: string) => { status: number; reply: string }): Promise<string> {
  server = http.createServer((req, res) => {
    if (req.headers["sec-fetch-mode"]) {
      res.writeHead(403).end(JSON.stringify({ error: "client is not allowed to access from origin ''" }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/config/") return void res.writeHead(200).end("{}");
      if (req.method === "POST" && req.url === "/load") {
        const { status, reply } = onLoad(body);
        return void res.writeHead(status).end(reply);
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

const config = buildCaddyConfig([{ hosts: ["a.localhost"], port: 4001 }]);

describe("Caddy admin client", () => {
  it("sends the config without browser-style headers, so Caddy accepts it", async () => {
    let received = "";
    const address = await startFakeCaddy((body) => {
      received = body;
      return { status: 200, reply: "" };
    });
    await expect(applyCaddyConfig(config, address)).resolves.toBeUndefined();
    expect(JSON.parse(received).apps.http.servers.main.routes[0].match[0].host).toEqual(["a.localhost"]);
  });

  it("reports Caddy's error message when it rejects the config", async () => {
    const address = await startFakeCaddy(() => ({ status: 400, reply: '{"error":"bad config"}' }));
    await expect(applyCaddyConfig(config, address)).rejects.toThrow(/400.*bad config/);
  });

  it("detects whether Caddy is running", async () => {
    const address = await startFakeCaddy(() => ({ status: 200, reply: "" }));
    expect(await isCaddyRunning(address)).toBe(true);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
    expect(await isCaddyRunning(address)).toBe(false);
  });
});
