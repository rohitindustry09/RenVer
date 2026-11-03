import { describe, expect, it } from "vitest";
import { dataUrlsForRoute } from "@/lib/route-data";

describe("dataUrlsForRoute", () => {
  it("lists what each main page loads, so it can be warmed before the click", () => {
    expect(dataUrlsForRoute("/")).toEqual(expect.arrayContaining(["/api/projects", "/api/usage", "/api/alerts"]));
    expect(dataUrlsForRoute("/deployments")).toEqual(["/api/deployments"]);
    expect(dataUrlsForRoute("/domains")).toEqual(["/api/domains"]);
    expect(dataUrlsForRoute("/databases")).toEqual(expect.arrayContaining(["/api/databases", "/api/projects"]));
    expect(dataUrlsForRoute("/settings")).toEqual(expect.arrayContaining(["/api/settings", "/api/backups", "/api/backups/schedule"]));
  });

  it("knows a project page by its id", () => {
    expect(dataUrlsForRoute("/projects/abc-123")).toEqual(["/api/projects/abc-123"]);
  });

  it("ignores query strings and trailing slashes", () => {
    expect(dataUrlsForRoute("/domains/")).toEqual(["/api/domains"]);
    expect(dataUrlsForRoute("/projects/abc?tab=settings")).toEqual(["/api/projects/abc"]);
  });

  it("has nothing to warm for pages that load nothing up front", () => {
    expect(dataUrlsForRoute("/new")).toEqual([]);
    expect(dataUrlsForRoute("/setup")).toEqual([]);
    expect(dataUrlsForRoute("/nowhere")).toEqual([]);
  });

  it("does not turn a hostile id into a different request", () => {
    expect(dataUrlsForRoute("/projects/..%2Fsystem")).toEqual([]);
    expect(dataUrlsForRoute("/projects/a/b")).toEqual([]);
  });
});
