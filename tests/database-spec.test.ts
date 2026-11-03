import { describe, expect, it } from "vitest";
import {
  ENGINES,
  buildConnectionUrl,
  deriveIdentifiers,
  envForEngine,
  generatePassword,
  isEngine,
  readyProbe,
  validateDatabaseName,
} from "@/lib/database-spec";

describe("validateDatabaseName", () => {
  it.each(["shop", "my-store-db", "a1b", "orders-2025"])("accepts %s", (name) => {
    expect(validateDatabaseName(name)).toEqual({ ok: true, value: name });
  });

  it("normalises case and whitespace", () => {
    expect(validateDatabaseName("  Shop-DB ")).toEqual({ ok: true, value: "shop-db" });
  });

  it.each(["", "ab", "1shop", "-shop", "shop-", "sh op", "shop_db", "a".repeat(31), "shop;drop", "../x"])(
    "rejects %j",
    (name) => {
      expect(validateDatabaseName(name).ok).toBe(false);
    },
  );
});

describe("deriveIdentifiers", () => {
  it("builds container, volume, database and user names", () => {
    expect(deriveIdentifiers("my-store")).toEqual({
      container: "renver-db-my-store",
      volume: "renver-db-my-store",
      database: "my_store",
      username: "u_my_store",
    });
  });

  it("keeps the username within MySQL's 32 character limit", () => {
    expect(deriveIdentifiers("a".repeat(30)).username.length).toBeLessThanOrEqual(32);
  });
});

describe("engines", () => {
  it("only allows known engines", () => {
    expect(isEngine("postgres")).toBe(true);
    expect(isEngine("mysql")).toBe(true);
    expect(isEngine("mariadb")).toBe(true);
    expect(isEngine("mongo")).toBe(false);
    expect(isEngine("postgres; rm")).toBe(false);
  });

  it("lists pinned versions and standard ports", () => {
    expect(ENGINES.postgres.versions.length).toBeGreaterThan(0);
    expect(ENGINES.postgres.port).toBe(5432);
    expect(ENGINES.mysql.port).toBe(3306);
    expect(ENGINES.mariadb.port).toBe(3306);
  });
});

describe("generatePassword", () => {
  it("is long, alphanumeric and unique", () => {
    const a = generatePassword();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(generatePassword()).not.toBe(a);
  });
});

describe("buildConnectionUrl", () => {
  const base = { username: "u", password: "p", host: "renver-db-x", database: "x" };

  it("uses the right scheme and port per engine", () => {
    expect(buildConnectionUrl({ engine: "postgres", ...base })).toBe("postgres://u:p@renver-db-x:5432/x");
    expect(buildConnectionUrl({ engine: "mysql", ...base })).toBe("mysql://u:p@renver-db-x:3306/x");
    expect(buildConnectionUrl({ engine: "mariadb", ...base })).toBe("mysql://u:p@renver-db-x:3306/x");
  });

  it("URL-encodes special characters in credentials", () => {
    const url = buildConnectionUrl({ engine: "postgres", ...base, password: "a/b@c:d" });
    expect(url).toBe("postgres://u:a%2Fb%40c%3Ad@renver-db-x:5432/x");
  });
});

describe("envForEngine", () => {
  const input = { username: "u", password: "p", database: "d", rootPassword: "r" };

  it("sets postgres variables", () => {
    expect(envForEngine("postgres", input)).toEqual({ POSTGRES_USER: "u", POSTGRES_PASSWORD: "p", POSTGRES_DB: "d" });
  });

  it("sets mysql variables including a root password", () => {
    expect(envForEngine("mysql", input)).toEqual({
      MYSQL_ROOT_PASSWORD: "r",
      MYSQL_USER: "u",
      MYSQL_PASSWORD: "p",
      MYSQL_DATABASE: "d",
    });
  });

  it("sets mariadb variables", () => {
    expect(envForEngine("mariadb", input)).toEqual({
      MARIADB_ROOT_PASSWORD: "r",
      MARIADB_USER: "u",
      MARIADB_PASSWORD: "p",
      MARIADB_DATABASE: "d",
    });
  });
});

describe("readyProbe", () => {
  it("checks postgres over TCP so the temporary init server does not count", () => {
    expect(readyProbe("postgres", "u", "d")).toEqual(["pg_isready", "-h", "127.0.0.1", "-U", "u", "-d", "d"]);
  });

  it("pings mysql and mariadb with the root password from inside the container", () => {
    expect(readyProbe("mysql", "u", "d").join(" ")).toContain("MYSQL_ROOT_PASSWORD");
    expect(readyProbe("mariadb", "u", "d").join(" ")).toContain("MARIADB_ROOT_PASSWORD");
  });
});
