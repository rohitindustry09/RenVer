import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cards on the Runtime tab are re-created when their saved value changes, using a key made from that value. Two cards whose
 * values are both empty lists used to share the key "[]", which made React add a copy of a card on every page refresh.
 * Each key must therefore start with its card's own name.
 */
describe("Runtime tab card keys", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/project/RuntimeTab.tsx"), "utf8");
  const keys = [...source.matchAll(/key=\{`([a-z]+):/g)].map((m) => m[1]);

  it("gives every value-keyed card its own prefix", () => {
    expect(keys).toEqual(expect.arrayContaining(["limits", "storage", "dns"]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never uses a bare JSON key, which two empty cards could share", () => {
    expect(source).not.toMatch(/key=\{JSON\.stringify/);
  });
});
