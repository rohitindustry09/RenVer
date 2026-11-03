import { describe, expect, it } from "vitest";
import { detectProject } from "@/lib/detect";
import { draftFromDetection, draftToPayload } from "@/lib/config-draft";
import { parseEnvPaste, rowsToEnv } from "@/lib/env-text";

describe("parseEnvPaste", () => {
  it("parses KEY=value lines, skipping blanks and comments", () => {
    const rows = parseEnvPaste("# comment\n\nA=1\nB = two words \n");
    expect(rows).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "two words" },
    ]);
  });

  it("keeps '=' inside values and unwraps quotes", () => {
    const rows = parseEnvPaste('URL=https://x.test/?a=b\nSECRET="quoted value"\nTOKEN=\'single\'');
    expect(rows).toEqual([
      { key: "URL", value: "https://x.test/?a=b" },
      { key: "SECRET", value: "quoted value" },
      { key: "TOKEN", value: "single" },
    ]);
  });

  it("accepts an export prefix and Windows line endings", () => {
    expect(parseEnvPaste("export A=1\r\nB=2\r\n")).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });

  it("skips lines without a key", () => {
    expect(parseEnvPaste("justtext\n=novalue")).toEqual([]);
  });
});

describe("rowsToEnv", () => {
  it("builds an object and ignores empty rows", () => {
    const result = rowsToEnv([
      { key: "A", value: "1" },
      { key: "", value: "" },
      { key: " B ", value: "2" },
    ]);
    expect(result).toEqual({ env: { A: "1", B: "2" }, error: null });
  });

  it("lets a later duplicate win", () => {
    expect(rowsToEnv([{ key: "A", value: "1" }, { key: "A", value: "2" }]).env).toEqual({ A: "2" });
  });

  it("reports invalid and reserved names", () => {
    expect(rowsToEnv([{ key: "bad key", value: "x" }]).error).toMatch(/invalid/i);
    expect(rowsToEnv([{ key: "PATH", value: "x" }]).error).toMatch(/reserved/i);
  });

  it("reports a value with no name", () => {
    expect(rowsToEnv([{ key: "", value: "x" }]).error).toMatch(/name/i);
  });
});

describe("config draft", () => {
  const detection = detectProject({
    exists: (p) => p === "package.json",
    read: (p) =>
      p === "package.json"
        ? JSON.stringify({ dependencies: { next: "15.0.0" }, scripts: { build: "next build", start: "next start" } })
        : null,
  });

  it("turns a detection into editable text fields", () => {
    const draft = draftFromDetection(detection);
    expect(draft.buildCommand).toBe("npm run build");
    expect(draft.port).toBe("3000");
    expect(draft.outputDir).toBe("");
  });

  it("converts the draft back to an API payload with a numeric port", () => {
    const payload = draftToPayload({ ...draftFromDetection(detection), port: "8080" });
    expect(payload.port).toBe(8080);
    expect(payload.startCommand).toBe("npm run start");
  });

  it("sends NaN for a non-numeric port so the server rejects it", () => {
    expect(Number.isNaN(draftToPayload({ ...draftFromDetection(detection), port: "abc" }).port)).toBe(true);
  });
});
