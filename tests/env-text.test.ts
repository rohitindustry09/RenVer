import { describe, expect, it } from "vitest";
import { mergeEnvRows, parseEnvPaste } from "@/lib/env-text";

describe("parseEnvPaste", () => {
  it("reads a Windows-style .env file with comments, export and quotes", () => {
    const text = "# app\r\nexport SHOPIFY_APP_URL=https://app.example.com\r\nSCOPES=\"read_products,write_products\"\r\nNAME='two words'\r\n\r\nBAD LINE\r\n";
    expect(parseEnvPaste(text)).toEqual([
      { key: "SHOPIFY_APP_URL", value: "https://app.example.com" },
      { key: "SCOPES", value: "read_products,write_products" },
      { key: "NAME", value: "two words" },
    ]);
  });

  it("drops a trailing comment on an unquoted value but keeps # inside quotes", () => {
    expect(parseEnvPaste("A=value # note\nB='a # b'")).toEqual([
      { key: "A", value: "value" },
      { key: "B", value: "a # b" },
    ]);
  });
});

describe("mergeEnvRows", () => {
  it("replaces variables with the same name, keeps the others, and drops empty rows", () => {
    const existing = [
      { key: "KEEP", value: "1" },
      { key: "URL", value: "old" },
      { key: "", value: "" },
    ];
    const merged = mergeEnvRows(existing, [
      { key: "URL", value: "new" },
      { key: "ADDED", value: "2" },
    ]);
    expect(merged).toEqual([
      { key: "KEEP", value: "1" },
      { key: "URL", value: "new" },
      { key: "ADDED", value: "2" },
    ]);
  });

  it("lets the last occurrence win when the file repeats a name", () => {
    expect(mergeEnvRows([], [{ key: "A", value: "1" }, { key: "A", value: "2" }])).toEqual([{ key: "A", value: "2" }]);
  });
});
