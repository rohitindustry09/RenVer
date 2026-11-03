import { describe, expect, it } from "vitest";
import { binaryCandidates, resolveBinary } from "@/lib/binaries";

describe("resolveBinary", () => {
  const env = {
    PATH: "C:\\Windows;C:\\Tools",
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    ProgramFiles: "C:\\Program Files",
  };

  it("prefers the PATH command over a known install folder", () => {
    const onPath = new Set(["C:\\Tools\\docker.exe", "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"]);
    expect(resolveBinary("docker", env, "win32", (f) => onPath.has(f))).toBe("docker");
  });

  it("falls back to a known install folder when not on PATH", () => {
    const link = "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\caddy.exe";
    expect(resolveBinary("caddy", env, "win32", (f) => f === link)).toBe(link);
  });

  it("finds a binary inside a winget package folder (not on this process's PATH)", () => {
    const packages = "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages";
    const caddy = `${packages}\\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\\caddy.exe`;
    const readdir = (dir: string) =>
      dir === packages ? ["Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe"] : [];
    expect(resolveBinary("caddy", env, "win32", (f) => f === caddy, readdir)).toBe(caddy);
  });

  it("ignores winget package folders that do not contain the binary", () => {
    const packages = "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages";
    const readdir = (dir: string) => (dir === packages ? ["Some.Other_Pkg"] : []);
    expect(resolveBinary("caddy", env, "win32", () => false, readdir)).toBe("caddy");
  });

  it("returns the bare name when nothing is found", () => {
    expect(resolveBinary("caddy", env, "win32", () => false)).toBe("caddy");
  });

  it("finds commands on a POSIX PATH", () => {
    expect(resolveBinary("caddy", { PATH: "/usr/bin:/usr/local/bin" }, "linux", (f) => f === "/usr/local/bin/caddy")).toBe("caddy");
  });
});

describe("binaryCandidates", () => {
  it("looks in the winget links folder on Windows", () => {
    const env = { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local", ProgramFiles: "C:\\Program Files" };
    const list = binaryCandidates("caddy", "win32", env);
    expect(list.some((p) => p.includes("WinGet") && p.endsWith("caddy.exe"))).toBe(true);
  });

  it("includes the Docker Desktop install folder for docker", () => {
    const list = binaryCandidates("docker", "win32", { ProgramFiles: "C:\\Program Files" });
    expect(list.some((p) => p.includes("Docker") && p.endsWith("docker.exe"))).toBe(true);
  });

  it("has no fixed candidates on Linux, where PATH is reliable", () => {
    expect(binaryCandidates("caddy", "linux", {})).toEqual([]);
  });

  it("skips candidates whose base folder is unknown", () => {
    expect(binaryCandidates("caddy", "win32", {})).toEqual([]);
  });
});
