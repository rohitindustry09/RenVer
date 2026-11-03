import { describe, expect, it } from "vitest";
import { validatePanelHost } from "@/lib/panel-host";

const domains = ["example.com"];
const unused = () => false;

describe("validatePanelHost", () => {
  it("accepts an empty value (private panel) and names on a verified domain, in any case", () => {
    expect(validatePanelHost("", domains, unused)).toEqual({ ok: true, value: "" });
    expect(validatePanelHost("  Panel.Example.com ", domains, unused)).toEqual({ ok: true, value: "panel.example.com" });
    expect(validatePanelHost("example.com", domains, unused)).toEqual({ ok: true, value: "example.com" });
  });

  it("refuses names that are not valid hostnames", () => {
    for (const bad of ["panel", "pa nel.example.com", "http://panel.example.com", "-x.example.com", "panel.example.com/path"]) {
      expect(validatePanelHost(bad, domains, unused).ok).toBe(false);
    }
  });

  it("refuses a domain that was not verified, including look-alikes", () => {
    expect(validatePanelHost("panel.other.com", domains, unused).ok).toBe(false);
    expect(validatePanelHost("panel.notexample.com", domains, unused).ok).toBe(false);
  });

  it("refuses an address an app already uses", () => {
    expect(validatePanelHost("app.example.com", domains, (h) => h === "app.example.com").ok).toBe(false);
  });
});
