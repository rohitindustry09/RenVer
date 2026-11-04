import { describe, expect, it } from "vitest";
import { MAX_DNS_SERVERS, findDnsFailure, validateDnsServers } from "@/lib/dns-servers";

const value = (input: string | string[]) => {
  const result = validateDnsServers(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("validateDnsServers", () => {
  it("accepts addresses separated by commas, spaces or lines, without duplicates", () => {
    expect(value("1.1.1.1, 8.8.8.8\n1.1.1.1")).toEqual(["1.1.1.1", "8.8.8.8"]);
    expect(value("")).toEqual([]);
    expect(value("2606:4700:4700::1111")).toEqual(["2606:4700:4700::1111"]);
  });

  it("refuses hostnames, bad numbers and too many servers", () => {
    for (const bad of ["dns.google", "300.1.1.1", "1.1.1", "1.1.1.1; rm", "http://1.1.1.1"]) {
      expect(validateDnsServers(bad).ok).toBe(false);
    }
    expect(validateDnsServers(Array.from({ length: MAX_DNS_SERVERS + 1 }, (_, i) => `1.1.1.${i + 1}`)).ok).toBe(false);
  });
});

describe("findDnsFailure", () => {
  it("finds a Node lookup failure and names the host", () => {
    const lines = ["server started", "Error: getaddrinfo ENOTFOUND api.gold-api.com", "    at GetAddrInfoReqWrap.onlookupall"];
    expect(findDnsFailure(lines)).toEqual({ host: "api.gold-api.com", line: "Error: getaddrinfo ENOTFOUND api.gold-api.com" });
    expect(findDnsFailure(["getaddrinfo EAI_AGAIN registry.example.org"])?.host).toBe("registry.example.org");
  });

  it("finds curl, Go and generic resolver messages", () => {
    expect(findDnsFailure(["curl: (6) Could not resolve host: example.com"])?.host).toBe("example.com");
    expect(findDnsFailure(["dial tcp: lookup example.com on 127.0.0.11:53: no such host"])?.host).toBe("example.com");
    expect(findDnsFailure(["Temporary failure in name resolution"])?.host).toBeNull();
  });

  it("reports the newest failure and nothing for healthy logs", () => {
    expect(findDnsFailure(["ENOTFOUND old.example.com", "ok", "ENOTFOUND new.example.com"])?.host).toBe("new.example.com");
    expect(findDnsFailure(["listening on 3000", "GET / 200"])).toBeNull();
  });
});
