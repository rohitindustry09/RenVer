import { describe, expect, it } from "vitest";
import { qrMatrix, renderQr } from "@/lib/qr-terminal";

const ESC = "\u001b";
// The same character with fg/bg colours picked from black (0) and white (7).
const cell = (top: "dark" | "light", bottom: "dark" | "light") =>
  `${ESC}[3${top === "dark" ? 0 : 7}m${ESC}[4${bottom === "dark" ? 0 : 7}m▀`;

describe("renderQr", () => {
  it("packs two module rows into each text line, on a white margin", () => {
    const text = renderQr([[true, false], [false, true]], { quietZone: 0 });
    expect(text).toBe(`${cell("dark", "light")}${cell("light", "dark")}${ESC}[0m`);
  });

  it("surrounds the code with a light quiet zone so scanners can find it", () => {
    const lines = renderQr([[true]], { quietZone: 2 }).split("\n");
    // 1 module + 2 margin each side = 5 rows -> 3 text lines (an odd last row is padded light), 5 columns wide.
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.split("▀")).toHaveLength(6);
    expect(lines[0]).toBe(`${cell("light", "light")}`.repeat(5) + `${ESC}[0m`);
  });

  it("puts the dark module of a 1x1 code in the right place", () => {
    const lines = renderQr([[true]], { quietZone: 1 }).split("\n");
    // rows: light, dark, light -> line 0 = (light, dark) pairs, line 1 = (light, light)
    expect(lines[0]).toBe(cell("light", "light") + cell("light", "dark") + cell("light", "light") + `${ESC}[0m`);
    expect(lines[1]).toBe((cell("light", "light")).repeat(3) + `${ESC}[0m`);
  });

  it("handles an empty matrix", () => {
    expect(renderQr([], { quietZone: 0 })).toBe("");
  });
});

describe("qrMatrix", () => {
  const uri = "otpauth://totp/RenVer:admin?secret=GEZDGNBVGY3TQOJQ&issuer=RenVer";

  it("makes a square matrix of at least version 1 (21 modules)", () => {
    const matrix = qrMatrix(uri);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
  });

  it("starts with the three finder squares every QR code has", () => {
    const m = qrMatrix(uri);
    const last = m.length - 1;
    // top-left, top-right and bottom-left corners are dark, and the bottom-right corner is not part of a finder
    expect([m[0]![0], m[0]![last], m[last]![0]]).toEqual([true, true, true]);
    // each finder has a 7-wide dark top edge
    expect(m[0]!.slice(0, 7).every(Boolean)).toBe(true);
    expect(m[0]!.slice(last - 6).every(Boolean)).toBe(true);
  });

  it("is the same for the same text and different for different text", () => {
    expect(qrMatrix(uri)).toEqual(qrMatrix(uri));
    expect(qrMatrix(uri)).not.toEqual(qrMatrix(uri.replace("GEZD", "GEZE")));
  });
});
