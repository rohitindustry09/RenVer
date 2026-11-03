import { describe, expect, it } from "vitest";
import { MAX_STORAGE_PATHS, validateStoragePaths } from "@/lib/storage";
import { volumeName } from "@/lib/volume-name";

const value = (input: string | string[]) => {
  const result = validateStoragePaths(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("validateStoragePaths", () => {
  it("accepts one folder per line, tidies slashes and removes duplicates", () => {
    expect(value("/data\n /uploads/ \n\n/data")).toEqual(["/data", "/uploads"]);
    expect(value("")).toEqual([]);
  });

  it("refuses relative paths, traversal, odd characters and the root", () => {
    for (const bad of ["data", "../data", "/a/../b", "/da ta", "/data;rm", "/", "/a/./b", "C:\\data"]) {
      expect(validateStoragePaths(bad).ok).toBe(false);
    }
  });

  it("refuses system folders", () => {
    for (const bad of ["/proc", "/etc/app", "/usr/local", "/dev/shm"]) expect(validateStoragePaths(bad).ok).toBe(false);
  });

  it("refuses a folder inside another listed one, and too many folders", () => {
    expect(validateStoragePaths("/data\n/data/sub").ok).toBe(false);
    const many = Array.from({ length: MAX_STORAGE_PATHS + 1 }, (_, i) => `/f${i}`);
    expect(validateStoragePaths(many).ok).toBe(false);
  });
});

describe("volumeName", () => {
  it("is stable for the same project and folder, and different otherwise", () => {
    expect(volumeName("p1", "/data")).toBe(volumeName("p1", "/data"));
    expect(volumeName("p1", "/data")).not.toBe(volumeName("p1", "/other"));
    expect(volumeName("p1", "/data")).not.toBe(volumeName("p2", "/data"));
    expect(volumeName("p1", "/data")).toMatch(/^renver-vol-p1-[0-9a-f]{8}$/);
  });
});
