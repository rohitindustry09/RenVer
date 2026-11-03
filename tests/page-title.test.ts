import { describe, expect, it } from "vitest";
import { pageTitle } from "@/lib/page-title";

describe("pageTitle", () => {
  it.each([
    ["/", "All Projects"],
    ["/deployments", "Deployments"],
    ["/domains", "Domains"],
    ["/databases", "Databases"],
    ["/settings", "Settings"],
    ["/new", "New Project"],
    ["/new/configure", "New Project"],
    ["/projects/abc-123", "Project"],
    ["/setup", "Setup"],
  ])("%s -> %s", (path, title) => {
    expect(pageTitle(path)).toBe(title);
  });

  it("ignores trailing slashes and falls back sensibly", () => {
    expect(pageTitle("/domains/")).toBe("Domains");
    expect(pageTitle("/something-else")).toBe("RenVer");
  });
});
