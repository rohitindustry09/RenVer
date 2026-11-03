import { describe, expect, it } from "vitest";
import { adminUsername, credentialsMatch, loginKey, safeNext } from "@/lib/login";

describe("safeNext", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNext("/projects/abc?tab=runtime")).toBe("/projects/abc?tab=runtime");
    expect(safeNext("/settings")).toBe("/settings");
  });

  it("falls back to the home page for anything that could lead elsewhere", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", "/%0d%0aSet-Cookie:x", "/a\nb"]) {
      expect(safeNext(bad), bad).toBe("/");
    }
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });

  it("never sends someone back to the sign-in or code pages", () => {
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
    expect(safeNext("/verify")).toBe("/");
    expect(safeNext("/api/auth/login")).toBe("/");
  });
});

describe("adminUsername", () => {
  it("is admin unless RENVER_ADMIN_USER says otherwise", () => {
    expect(adminUsername(undefined)).toBe("admin");
    expect(adminUsername("")).toBe("admin");
    expect(adminUsername("  ")).toBe("admin");
    expect(adminUsername("rohit")).toBe("rohit");
    expect(adminUsername(" rohit ")).toBe("rohit");
  });
});

describe("credentialsMatch", () => {
  it("accepts the right username and password", async () => {
    expect(await credentialsMatch("admin", "s3cret", "admin", "s3cret")).toBe(true);
  });

  it("refuses a wrong password, a wrong username, or both, and gives no hint which", async () => {
    expect(await credentialsMatch("admin", "nope", "admin", "s3cret")).toBe(false);
    expect(await credentialsMatch("root", "s3cret", "admin", "s3cret")).toBe(false);
    expect(await credentialsMatch("root", "nope", "admin", "s3cret")).toBe(false);
    expect(await credentialsMatch("", "", "admin", "s3cret")).toBe(false);
  });

  it("treats the username as exact: letters matter, spaces do not count as part of it", async () => {
    expect(await credentialsMatch("Admin", "s3cret", "admin", "s3cret")).toBe(false);
    expect(await credentialsMatch(" admin ", "s3cret", "admin", "s3cret")).toBe(true);
  });

  it("never matches when no password is configured", async () => {
    expect(await credentialsMatch("admin", "", "admin", "")).toBe(false);
  });
});

describe("loginKey", () => {
  it("changes when the username or the password changes, so a new password signs everyone out", () => {
    expect(loginKey("admin", "a")).not.toBe(loginKey("admin", "b"));
    expect(loginKey("admin", "a")).not.toBe(loginKey("root", "a"));
    expect(loginKey("admin", "a")).toBe(loginKey("admin", "a"));
  });
});
