import { describe, expect, it } from "vitest";
import { detectProject, type ProjectFiles } from "@/lib/detect";
import { stackLabel, stackOf } from "@/lib/stack";

function files(entries: Record<string, string>): ProjectFiles {
  return { exists: (p) => p in entries, read: (p) => entries[p] ?? null };
}

const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { build: "x" }) =>
  files({ "package.json": JSON.stringify({ dependencies: deps, scripts }) });

describe("detectProject stack", () => {
  it.each([
    [{ next: "15" }, { start: "next start", build: "next build" }, "nextjs"],
    [{ nuxt: "3" }, { start: "nuxt start" }, "nuxt"],
    [{ "@angular/core": "19" }, { start: "ng serve" }, "angular"],
    [{ astro: "5" }, { start: "astro preview" }, "astro"],
    [{ "@sveltejs/kit": "2", svelte: "5" }, { start: "node build" }, "svelte"],
    [{ "@nestjs/core": "10" }, { start: "node dist/main" }, "nestjs"],
    [{ express: "4" }, { start: "node index.js" }, "express"],
    [{ fastify: "5" }, { start: "node index.js" }, "fastify"],
    [{ react: "19", vite: "6" }, { build: "vite build" }, "react"],
    [{ vue: "3", vite: "6" }, { build: "vite build" }, "vue"],
    [{ vite: "6" }, { build: "vite build" }, "vite"],
    [{ lodash: "4" }, { start: "node app.js" }, "node"],
  ])("%j → %s", (deps, scripts, stack) => {
    expect(detectProject(pkg(deps, scripts)).stack).toBe(stack);
  });

  it("recognises plain HTML and Dockerfile projects", () => {
    expect(detectProject(files({ "index.html": "<html></html>" })).stack).toBe("html");
    expect(detectProject(files({ Dockerfile: "FROM node" })).stack).toBe("docker");
  });

  it("does not change how a project is built or run", () => {
    const vite = detectProject(pkg({ react: "19", vite: "6" }, { build: "vite build" }));
    expect(vite.framework).toBe("vite");
    expect(vite.kind).toBe("static");
  });
});

describe("stackOf", () => {
  it("prefers the saved stack", () => {
    expect(stackOf({ framework: "node", stack: "react" })).toBe("react");
  });

  it("falls back to the framework for projects saved before stacks existed", () => {
    expect(stackOf({ framework: "static" })).toBe("html");
    expect(stackOf({ framework: "dockerfile" })).toBe("docker");
    expect(stackOf({ framework: "nextjs" })).toBe("nextjs");
    expect(stackOf({ framework: "something-new" })).toBe("unknown");
  });
});

describe("stackLabel", () => {
  it("gives a readable name", () => {
    expect(stackLabel("nextjs")).toBe("Next.js");
    expect(stackLabel("html")).toBe("Static HTML");
    expect(stackLabel("unknown")).toBe("Unknown");
  });
});
