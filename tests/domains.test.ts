import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ProjectConfig } from "@/lib/db";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "renver-domains-"));
process.env.RENVER_DATA_DIR = dataDir;

const projectConfig: ProjectConfig = {
  framework: "static",
  kind: "static",
  installCommand: null,
  buildCommand: null,
  startCommand: null,
  outputDir: ".",
  port: 80,
  nodeVersion: "22",
  packageManager: "npm",
};

const globalDb = globalThis as { __renverDb?: { close(): void } };
afterAll(() => {
  globalDb.__renverDb?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const load = async () => ({ db: await import("@/lib/db"), svc: await import("@/lib/domains") });

async function projectOn(domainName: string, label: string, name = "Proj") {
  const { db, svc } = await load();
  const domain = db.getDomainByName(domainName)!;
  const plan = svc.planProjectHost(domain.id, label);
  return db.createProject({
    name,
    subdomain: svc.uniqueSlug(plan.host),
    primaryHost: plan.host,
    domainId: plan.domain.id,
    config: projectConfig,
    envEncrypted: null,
  });
}

describe("addDomain", () => {
  it("verifies local domains immediately and leaves real ones pending", async () => {
    const { svc } = await load();
    expect(svc.addDomain("dev.localhost").status).toBe("verified");
    const real = svc.addDomain("https://Shop.Example.org/anything");
    expect(real).toMatchObject({ name: "shop.example.org", status: "pending" });
    expect(real.token).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects duplicates and invalid names", async () => {
    const { svc } = await load();
    svc.addDomain("dup.example.net");
    expect(() => svc.addDomain("DUP.example.net")).toThrow(/already/i);
    expect(() => svc.addDomain("127.0.0.1")).toThrow();
    expect(() => svc.addDomain("")).toThrow();
  });
});

describe("verifyDomain", () => {
  it("verifies when the TXT record carries the token", async () => {
    const { db, svc } = await load();
    const domain = svc.addDomain("verify-ok.example.com");
    const seen: string[] = [];
    const result = await svc.verifyDomain(domain.id, async (host) => {
      seen.push(host);
      return [["v=spf1 -all"], [`renver-verify=${domain.token}`]];
    });
    expect(result.verified).toBe(true);
    expect(seen).toEqual(["_renver-challenge.verify-ok.example.com"]);
    expect(db.getDomain(domain.id)?.status).toBe("verified");
  });

  it("stays pending and explains what to add when the record is missing or wrong", async () => {
    const { db, svc } = await load();
    const domain = svc.addDomain("verify-no.example.com");

    const wrong = await svc.verifyDomain(domain.id, async () => [["renver-verify=not-the-token"]]);
    expect(wrong.verified).toBe(false);
    expect(wrong.message).toContain("_renver-challenge.verify-no.example.com");

    const missing = await svc.verifyDomain(domain.id, async () => {
      throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
    });
    expect(missing.verified).toBe(false);
    expect(db.getDomain(domain.id)?.status).toBe("pending");
  });

  it("reports other DNS errors instead of pretending the record is missing", async () => {
    const { svc } = await load();
    const domain = svc.addDomain("verify-err.example.com");
    const result = await svc.verifyDomain(domain.id, async () => {
      throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
    });
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/could not reach|try again/i);
  });

  it("does not look anything up for an already verified domain", async () => {
    const { svc } = await load();
    const domain = svc.addDomain("verified.localhost");
    const result = await svc.verifyDomain(domain.id, async () => {
      throw new Error("should not be called");
    });
    expect(result.verified).toBe(true);
  });

  it("404s for an unknown domain", async () => {
    const { svc } = await load();
    await expect(svc.verifyDomain("nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("resilientTxtResolver", () => {
  const dnsError = (code: string) => Object.assign(new Error(code), { code });

  it("uses the system resolver when it works", async () => {
    const { svc } = await load();
    const calls: string[] = [];
    const resolve = svc.resilientTxtResolver(
      async () => (calls.push("system"), [["a"]]),
      async () => (calls.push("public"), [["b"]]),
    );
    expect(await resolve("x.example.com")).toEqual([["a"]]);
    expect(calls).toEqual(["system"]);
  });

  it("does not second-guess a genuine 'no such record' answer", async () => {
    const { svc } = await load();
    const calls: string[] = [];
    const resolve = svc.resilientTxtResolver(
      async () => {
        calls.push("system");
        throw dnsError("ENOTFOUND");
      },
      async () => (calls.push("public"), [["b"]]),
    );
    await expect(resolve("x.example.com")).rejects.toMatchObject({ code: "ENOTFOUND" });
    expect(calls).toEqual(["system"]);
  });

  it("falls back to public resolvers when the system resolver itself is broken", async () => {
    const { svc } = await load();
    for (const code of ["ECONNREFUSED", "ETIMEOUT", "ESERVFAIL"]) {
      const resolve = svc.resilientTxtResolver(
        async () => {
          throw dnsError(code);
        },
        async () => [["from-public"]],
      );
      expect(await resolve("x.example.com")).toEqual([["from-public"]]);
    }
  });

  it("reports the fallback's error when both fail", async () => {
    const { svc } = await load();
    const resolve = svc.resilientTxtResolver(
      async () => {
        throw dnsError("ECONNREFUSED");
      },
      async () => {
        throw dnsError("ETIMEOUT");
      },
    );
    await expect(resolve("x.example.com")).rejects.toMatchObject({ code: "ETIMEOUT" });
  });
});

describe("planProjectHost", () => {
  it("builds subdomain and root hostnames on a verified domain", async () => {
    const { db, svc } = await load();
    const domain = db.getDomainByName("dev.localhost")!;
    expect(svc.planProjectHost(domain.id, "shop").host).toBe("shop.dev.localhost");
    expect(svc.planProjectHost(domain.id, "").host).toBe("dev.localhost");
    expect(svc.planProjectHost(domain.id, "@").host).toBe("dev.localhost");
  });

  it("refuses a domain that has not been verified", async () => {
    const { db, svc } = await load();
    const pending = db.getDomainByName("shop.example.org")!;
    expect(() => svc.planProjectHost(pending.id, "www")).toThrow(/verify/i);
  });

  it("refuses unknown domains, invalid labels and hostnames already in use", async () => {
    const { db, svc } = await load();
    const domain = db.getDomainByName("dev.localhost")!;
    expect(() => svc.planProjectHost("nope", "x")).toThrow(/not found/i);
    expect(() => svc.planProjectHost(domain.id, "bad label")).toThrow();
    await projectOn("dev.localhost", "taken");
    expect(() => svc.planProjectHost(domain.id, "taken")).toThrow(/already in use/i);
  });
});

describe("uniqueSlug", () => {
  it("adds a number when a project already uses the slug", async () => {
    const { svc } = await load();
    await projectOn("dev.localhost", "slugtest", "S1");
    expect(svc.uniqueSlug("slugtest.dev.localhost")).toBe("slugtest-dev-localhost-2");
  });
});

describe("project hostnames", () => {
  it("adds a second hostname, and keeps at least one", async () => {
    const { db, svc } = await load();
    const project = await projectOn("dev.localhost", "twohosts", "Two");
    const domain = db.getDomainByName("dev.localhost")!;

    expect(svc.addHostToProject(project.id, domain.id, "")).toBe("dev.localhost");
    expect(db.listProjectHosts(project.id).map((h) => h.host).sort()).toEqual(["dev.localhost", "twohosts.dev.localhost"]);

    svc.removeHostFromProject(project.id, "twohosts.dev.localhost");
    expect(db.getProject(project.id)?.primaryHost).toBe("dev.localhost");
    expect(() => svc.removeHostFromProject(project.id, "dev.localhost")).toThrow(/at least one/i);
  });

  it("will not remove a hostname that belongs to another project", async () => {
    const { svc } = await load();
    const a = await projectOn("dev.localhost", "owner-a", "A");
    const b = await projectOn("dev.localhost", "owner-b", "B");
    expect(() => svc.removeHostFromProject(b.id, "owner-a.dev.localhost")).toThrow(/not found/i);
    expect(a.primaryHost).toBe("owner-a.dev.localhost");
  });
});

describe("removeDomain", () => {
  it("refuses while hostnames use the domain, and deletes it otherwise", async () => {
    const { db, svc } = await load();
    const domain = svc.addDomain("removeme.localhost");
    const project = await projectOn("removeme.localhost", "app", "Rm");
    expect(() => svc.removeDomain(domain.id)).toThrow(/in use|still/i);
    db.deleteProject(project.id);
    svc.removeDomain(domain.id);
    expect(db.getDomain(domain.id)).toBeNull();
  });
});

describe("checkDomainDns", () => {
  it("checks the root and a wildcard probe against this server's addresses", async () => {
    const { db, svc } = await load();
    svc.setServerIp("203.0.113.50");
    const domain = svc.addDomain("dnscheck.example.io");
    const asked: string[] = [];
    const result = await svc.checkDomainDns(db.getDomain(domain.id)!, async (name) => {
      asked.push(name);
      return name === "dnscheck.example.io" ? ["203.0.113.50"] : [];
    });
    expect(asked).toEqual(["dnscheck.example.io", "renver-dns-check.dnscheck.example.io"]);
    expect(result.root.status).toBe("ok");
    expect(result.wildcard.status).toBe("fail");
    expect(result.wildcard.message).toContain("*.dnscheck.example.io");
    svc.setServerIp("");
  });

  it("warns when the domain points at some other address", async () => {
    const { db, svc } = await load();
    const domain = svc.addDomain("elsewhere.example.io");
    const result = await svc.checkDomainDns(db.getDomain(domain.id)!, async () => ["198.51.100.99"]);
    expect(result.root.status).toBe("warn");
    expect(result.root.message).toContain("198.51.100.99");
  });
});

describe("server addresses", () => {
  it("lists the configured IP first and rejects invalid ones", async () => {
    const { svc } = await load();
    svc.setServerIp("203.0.113.7");
    expect(svc.serverAddresses()[0]).toBe("203.0.113.7");
    expect(() => svc.setServerIp("not an ip")).toThrow(/valid/i);
    svc.setServerIp("");
    expect(svc.serverAddresses()).not.toContain("203.0.113.7");
  });
});
