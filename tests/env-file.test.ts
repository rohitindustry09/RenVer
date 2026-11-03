import { describe, expect, it } from "vitest";
import { formatEnvValue, parseEnv, updateEnvText } from "../scripts/env-file.mjs";

describe("parseEnv", () => {
  it("reads plain, quoted and Windows-style lines without expanding or keeping stray characters", () => {
    const values = parseEnv("A=one\r\nB='p$ss #word'\r\nC=\"two words\"\r\n# D=skipped\r\nE=with $HOME and more\r\n");
    expect(values).toEqual({ A: "one", B: "p$ss #word", C: "two words", E: "with $HOME and more" });
  });

  it("drops a trailing comment on an unquoted value only", () => {
    expect(parseEnv("A=value # note\nB='value # kept'")).toEqual({ A: "value", B: "value # kept" });
  });

  it("lets a later line win and understands export", () => {
    expect(parseEnv("export A=1\nA=2")).toEqual({ A: "2" });
  });
});

describe("formatEnvValue", () => {
  it("round-trips awkward values through parseEnv", () => {
    for (const value of ["plain-value_1", "has space", "dollar$sign", "hash # tag", "it's", " edge ", ""]) {
      expect(parseEnv(`K=${formatEnvValue(value)}`).K).toBe(value);
    }
  });

  it("refuses a value that cannot be quoted either way", () => {
    expect(() => formatEnvValue(`a'b"c`)).toThrow();
  });
});

describe("updateEnvText", () => {
  const base = "# header\nRENVER_MODE=local\n# RENVER_ADMIN_USER=admin\nRENVER_ADMIN_PASSWORD=\n";

  it("replaces a set key, switches on a commented one and appends a new one, keeping the rest", () => {
    const text = updateEnvText(base, { RENVER_MODE: "production", RENVER_ADMIN_USER: "owner", RENVER_ADMIN_PASSWORD: "s3 cret$", NEW_KEY: "x" });
    expect(text).toBe("# header\nRENVER_MODE=production\nRENVER_ADMIN_USER=owner\nRENVER_ADMIN_PASSWORD='s3 cret$'\nNEW_KEY=x\n");
    expect(parseEnv(text).RENVER_ADMIN_PASSWORD).toBe("s3 cret$");
  });

  it("leaves a key alone when its value is undefined, and builds a file from nothing", () => {
    expect(updateEnvText(base, { RENVER_MODE: undefined })).toBe(base);
    expect(updateEnvText("", { A: "1" })).toBe("A=1\n");
  });
});
