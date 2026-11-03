import { describe, expect, it } from "vitest";
import { detectProject } from "@/lib/detect";
import { generateDockerfile } from "@/lib/dockerfile";

const nextDetection = detectProject({
  exists: (p) => p === "package.json" || p === "pnpm-lock.yaml",
  read: (p) =>
    p === "package.json"
      ? JSON.stringify({
          dependencies: { next: "15.0.0" },
          scripts: { build: "next build", start: "next start" },
        })
      : null,
});

const viteDetection = detectProject({
  exists: (p) => p === "package.json",
  read: (p) =>
    p === "package.json"
      ? JSON.stringify({ devDependencies: { vite: "6.0.0" }, scripts: { build: "vite build" } })
      : null,
});

const baseOptions = { envKeys: [] as string[] };

describe("generateDockerfile", () => {
  it("returns null when the project ships its own Dockerfile", () => {
    const det = { ...nextDetection, framework: "dockerfile" as const };
    expect(generateDockerfile(det, baseOptions)).toBeNull();
  });

  it("builds a server image with install, build and start", () => {
    const out = generateDockerfile(nextDetection, baseOptions)!;
    expect(out.dockerfile).toContain("FROM node:22-slim");
    expect(out.dockerfile).toContain("corepack enable");
    expect(out.dockerfile).toContain("RUN pnpm install --frozen-lockfile");
    expect(out.dockerfile).toContain("RUN pnpm run build");
    expect(out.dockerfile).toContain("EXPOSE 3000");
    expect(out.dockerfile).toContain('CMD ["sh", "-c", "pnpm run start"]');
    expect(out.port).toBe(3000);
  });

  it("uses the detected Node version", () => {
    const out = generateDockerfile({ ...nextDetection, nodeVersion: "20" }, baseOptions)!;
    expect(out.dockerfile).toContain("FROM node:20-slim");
  });

  it("serves static sites through nginx with SPA fallback", () => {
    const out = generateDockerfile(viteDetection, baseOptions)!;
    expect(out.dockerfile).toContain("AS build");
    expect(out.dockerfile).toContain("FROM nginx:alpine");
    expect(out.dockerfile).toContain("COPY --from=build /app/dist /usr/share/nginx/html");
    expect(out.extraFiles["renver-nginx.conf"]).toContain("try_files $uri /index.html");
    expect(out.port).toBe(80);
  });

  it("declares build args only for valid env keys", () => {
    const out = generateDockerfile(nextDetection, { envKeys: ["NEXT_PUBLIC_URL", "bad key", "X;rm"] })!;
    expect(out.dockerfile).toContain("ARG NEXT_PUBLIC_URL");
    expect(out.dockerfile).toContain("ENV NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL");
    expect(out.dockerfile).not.toContain("bad key");
    expect(out.dockerfile).not.toContain("X;rm");
  });

  it("rejects a non-numeric Node version", () => {
    expect(() =>
      generateDockerfile({ ...nextDetection, nodeVersion: "20; rm -rf /" }, baseOptions),
    ).toThrow(/node version/i);
  });
});
