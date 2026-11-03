import { describe, expect, it } from "vitest";
import { detectProject, type ProjectFiles } from "@/lib/detect";

function files(entries: Record<string, string>): ProjectFiles {
  return {
    exists: (p) => p in entries,
    read: (p) => entries[p] ?? null,
  };
}

const pkg = (obj: object) => JSON.stringify(obj);

describe("detectProject", () => {
  it("detects Next.js with pnpm", () => {
    const result = detectProject(
      files({
        "package.json": pkg({
          dependencies: { next: "15.0.0", react: "19.0.0" },
          scripts: { build: "next build", start: "next start" },
        }),
        "pnpm-lock.yaml": "",
      }),
    );
    expect(result.framework).toBe("nextjs");
    expect(result.kind).toBe("server");
    expect(result.packageManager).toBe("pnpm");
    expect(result.installCommand).toBe("pnpm install --frozen-lockfile");
    expect(result.buildCommand).toBe("pnpm run build");
    expect(result.startCommand).toBe("pnpm run start");
    expect(result.port).toBe(3000);
  });

  it("detects a Vite SPA as static with dist output", () => {
    const result = detectProject(
      files({
        "package.json": pkg({
          devDependencies: { vite: "6.0.0" },
          scripts: { build: "vite build" },
        }),
        "package-lock.json": "{}",
      }),
    );
    expect(result.framework).toBe("vite");
    expect(result.kind).toBe("static");
    expect(result.outputDir).toBe("dist");
    expect(result.installCommand).toBe("npm ci");
    expect(result.buildCommand).toBe("npm run build");
    expect(result.startCommand).toBeNull();
  });

  it("treats Vite plus express as a server app", () => {
    const result = detectProject(
      files({
        "package.json": pkg({
          dependencies: { express: "4.0.0" },
          devDependencies: { vite: "6.0.0" },
          scripts: { build: "vite build", start: "node server.js" },
        }),
      }),
    );
    expect(result.kind).toBe("server");
    expect(result.startCommand).toBe("npm run start");
  });

  it("detects a Shopify app and prefers docker-start", () => {
    const result = detectProject(
      files({
        "package.json": pkg({
          dependencies: { "@shopify/shopify-app-remix": "3.0.0" },
          scripts: {
            build: "remix vite:build",
            start: "remix-serve ./build/server/index.js",
            "docker-start": "npm run setup && npm run start",
          },
        }),
        "shopify.app.toml": "",
      }),
    );
    expect(result.framework).toBe("shopify");
    expect(result.startCommand).toBe("npm run docker-start");
    expect(result.notes.join(" ")).toMatch(/SHOPIFY_API_KEY/);
  });

  it("detects a plain Node server from the start script", () => {
    const result = detectProject(
      files({
        "package.json": pkg({
          dependencies: { express: "4.0.0" },
          scripts: { start: "node index.js" },
        }),
      }),
    );
    expect(result.framework).toBe("express");
    expect(result.buildCommand).toBeNull();
    expect(result.startCommand).toBe("npm run start");
  });

  it("falls back to node index.js when no start script exists", () => {
    const result = detectProject(
      files({
        "package.json": pkg({ main: "app.js", dependencies: {} }),
        "app.js": "",
      }),
    );
    expect(result.framework).toBe("node");
    expect(result.startCommand).toBe("node app.js");
  });

  it("uses a Dockerfile and reads EXPOSE", () => {
    const result = detectProject(
      files({
        Dockerfile: "FROM node:20\nEXPOSE 8080\nCMD [\"node\",\"x.js\"]",
        "package.json": pkg({ dependencies: { next: "15.0.0" } }),
      }),
    );
    expect(result.framework).toBe("dockerfile");
    expect(result.port).toBe(8080);
    expect(result.installCommand).toBeNull();
  });

  it("detects a plain static site from index.html", () => {
    const result = detectProject(files({ "index.html": "<html></html>" }));
    expect(result.framework).toBe("static");
    expect(result.kind).toBe("static");
    expect(result.outputDir).toBe(".");
    expect(result.buildCommand).toBeNull();
  });

  it("reads the Node major version from .nvmrc and engines", () => {
    const nvmrc = detectProject(
      files({
        "package.json": pkg({ scripts: { start: "node a.js" } }),
        ".nvmrc": "v22.3.0\n",
      }),
    );
    expect(nvmrc.nodeVersion).toBe("22");

    const engines = detectProject(
      files({
        "package.json": pkg({
          engines: { node: ">=20.10 <23" },
          scripts: { start: "node a.js" },
        }),
      }),
    );
    expect(engines.nodeVersion).toBe("20");
  });

  it("defaults the Node version when nothing is specified", () => {
    const result = detectProject(
      files({ "package.json": pkg({ scripts: { start: "node a.js" } }) }),
    );
    expect(result.nodeVersion).toBe("22");
  });

  it("returns unknown with low confidence for an empty project", () => {
    const result = detectProject(files({}));
    expect(result.framework).toBe("unknown");
    expect(result.confidence).toBe("low");
  });

  it("does not throw on invalid package.json", () => {
    const result = detectProject(files({ "package.json": "{ not json" }));
    expect(result.framework).toBe("unknown");
    expect(result.notes.join(" ")).toMatch(/package\.json/);
  });

  it("uses yarn and bun script runners", () => {
    const yarn = detectProject(
      files({
        "package.json": pkg({
          dependencies: { next: "15.0.0" },
          scripts: { build: "next build", start: "next start" },
        }),
        "yarn.lock": "",
      }),
    );
    expect(yarn.buildCommand).toBe("yarn build");
    expect(yarn.installCommand).toBe("yarn install --frozen-lockfile");

    const bun = detectProject(
      files({
        "package.json": pkg({
          dependencies: { next: "15.0.0" },
          scripts: { build: "next build", start: "next start" },
        }),
        "bun.lock": "",
      }),
    );
    expect(bun.buildCommand).toBe("bun run build");
    expect(bun.installCommand).toBe("bun install");
  });
});
