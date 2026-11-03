import { describe, expect, it } from "vitest";
import { assessDns } from "@/lib/dns-check";

const base = { baseDomain: "example.com", localAddresses: ["10.0.0.5", "fe80::1"] };

describe("assessDns", () => {
  it("names the record being checked in its message", () => {
    const root = assessDns({ ...base, mode: "production", addresses: [], recordName: "example.com" });
    expect(root.message).toMatch(/A record for example\.com/);
    expect(root.message).not.toMatch(/\*\./);
    const odd = assessDns({ ...base, mode: "production", addresses: ["203.0.113.9"], recordName: "example.com" });
    expect(odd.message).toContain("example.com resolves to 203.0.113.9");
  });

  it("trusts the browser to resolve .localhost names even when Node cannot", () => {
    const result = assessDns({ baseDomain: "localhost", localAddresses: [], mode: "local", addresses: [] });
    expect(result.status).toBe("ok");
    expect(result.message).toMatch(/browser/i);
    expect(assessDns({ baseDomain: "apps.localhost", localAddresses: [], mode: "local", addresses: [] }).status).toBe("ok");
  });

  it("still fails for a real domain in local mode with no record", () => {
    expect(assessDns({ baseDomain: "example.com", localAddresses: [], mode: "local", addresses: [] }).status).toBe("fail");
  });

  it("fails when nothing resolves", () => {
    const result = assessDns({ ...base, mode: "production", addresses: [] });
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/\*\.example\.com/);
  });

  it("is ok when the record points at this machine", () => {
    const result = assessDns({ ...base, mode: "production", addresses: ["10.0.0.5"] });
    expect(result.status).toBe("ok");
  });

  it("warns when it points somewhere else", () => {
    const result = assessDns({ ...base, mode: "production", addresses: ["203.0.113.9"] });
    expect(result.status).toBe("warn");
    expect(result.message).toContain("203.0.113.9");
  });

  it("accepts loopback addresses in local mode", () => {
    const result = assessDns({ baseDomain: "localhost", localAddresses: [], mode: "local", addresses: ["127.0.0.1", "::1"] });
    expect(result.status).toBe("ok");
  });

  it("warns about loopback in production mode", () => {
    const result = assessDns({ ...base, mode: "production", addresses: ["127.0.0.1"] });
    expect(result.status).toBe("warn");
  });
});
