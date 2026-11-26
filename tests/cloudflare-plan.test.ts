import { describe, expect, it } from "vitest";
import { belongsTo, buildIngress, planDns } from "@/lib/cloudflare-plan";

describe("belongsTo", () => {
  it("matches the domain itself and its subdomains only", () => {
    expect(belongsTo("domain.com", "domain.com")).toBe(true);
    expect(belongsTo("shop.domain.com", "domain.com")).toBe(true);
    expect(belongsTo("a.shop.domain.com", "domain.com")).toBe(true);
    expect(belongsTo("notdomain.com", "domain.com")).toBe(false);
    expect(belongsTo("domain.com.evil.io", "domain.com")).toBe(false);
  });
});

describe("buildIngress", () => {
  it("sends each hostname to its app and ends with a 404 catch-all", () => {
    const rules = buildIngress([
      { host: "b.domain.com", port: 4002 },
      { host: "a.domain.com", port: 4001 },
    ]);
    expect(rules).toEqual([
      { hostname: "a.domain.com", service: "http://127.0.0.1:4001" },
      { hostname: "b.domain.com", service: "http://127.0.0.1:4002" },
      { service: "http_status:404" },
    ]);
  });

  it("has only the catch-all when nothing is running", () => {
    expect(buildIngress([])).toEqual([{ service: "http_status:404" }]);
  });

  it("keeps one rule per hostname", () => {
    const rules = buildIngress([
      { host: "a.domain.com", port: 4001 },
      { host: "a.domain.com", port: 4009 },
    ]);
    expect(rules.filter((r) => r.hostname === "a.domain.com")).toHaveLength(1);
  });
});

describe("planDns", () => {
  const record = (zoneId: string, recordId: string) => ({ zoneId, recordId });

  it("creates records for new hosts and removes records for hosts that are gone", () => {
    const plan = planDns(["a.domain.com", "b.domain.com"], { "a.domain.com": record("z", "r1"), "old.domain.com": record("z", "r2") });
    expect(plan).toEqual({ create: ["b.domain.com"], remove: ["old.domain.com"] });
  });

  it("does nothing when everything matches", () => {
    expect(planDns(["a.domain.com"], { "a.domain.com": record("z", "r1") })).toEqual({ create: [], remove: [] });
  });

  it("ignores duplicate hosts", () => {
    expect(planDns(["a.domain.com", "a.domain.com"], {}).create).toEqual(["a.domain.com"]);
  });
});
