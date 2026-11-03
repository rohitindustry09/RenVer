import { stackFromDependencies, type Stack } from "./stack";

export interface ProjectFiles {
  exists(path: string): boolean;
  read(path: string): string | null;
}

export type Framework =
  | "shopify"
  | "nextjs"
  | "vite"
  | "express"
  | "node"
  | "static"
  | "dockerfile"
  | "unknown";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type ProjectKind = "server" | "static";
export type Confidence = "high" | "medium" | "low";

export interface DetectionResult {
  framework: Framework;
  /** What the project is built with, for its logo. Display only. */
  stack: Stack;
  kind: ProjectKind;
  packageManager: PackageManager;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  outputDir: string | null;
  port: number;
  nodeVersion: string;
  confidence: Confidence;
  notes: string[];
}

interface PackageJson {
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
}

const DEFAULT_NODE_VERSION = "22";
const DEFAULT_PORT = 3000;
const SERVER_LIBS = ["express", "fastify", "koa", "hono", "@nestjs/core", "@hapi/hapi"];
const SHOPIFY_LIBS = ["@shopify/shopify-app-remix", "@shopify/shopify-app-react-router"];
const SHOPIFY_NOTE =
  "Shopify app: set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES and SHOPIFY_APP_URL, and use a persistent volume for the session database.";

function detectPackageManager(files: ProjectFiles): PackageManager {
  if (files.exists("pnpm-lock.yaml")) return "pnpm";
  if (files.exists("yarn.lock")) return "yarn";
  if (files.exists("bun.lock") || files.exists("bun.lockb")) return "bun";
  return "npm";
}

function installCommandFor(pm: PackageManager, files: ProjectFiles): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --frozen-lockfile";
    case "bun":
      return "bun install";
    default:
      return files.exists("package-lock.json") ? "npm ci" : "npm install";
  }
}

function runScript(pm: PackageManager, script: string): string {
  return pm === "yarn" ? `yarn ${script}` : `${pm} run ${script}`;
}

function parseNodeVersion(files: ProjectFiles, pkg: PackageJson | null): string {
  const nvmrc = files.read(".nvmrc")?.trim().replace(/^v/, "");
  const fromNvmrc = nvmrc?.match(/^(\d+)/)?.[1];
  if (fromNvmrc) return fromNvmrc;
  const fromEngines = pkg?.engines?.node?.match(/(\d+)/)?.[1];
  return fromEngines ?? DEFAULT_NODE_VERSION;
}

function parsePackageJson(
  files: ProjectFiles,
  notes: string[],
): PackageJson | null {
  const raw = files.read("package.json");
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as PackageJson) : null;
  } catch {
    notes.push("package.json is not valid JSON.");
    return null;
  }
}

function emptyResult(
  files: ProjectFiles,
  pkg: PackageJson | null,
  notes: string[],
): DetectionResult {
  return {
    framework: "unknown",
    stack: "unknown",
    kind: "server",
    packageManager: detectPackageManager(files),
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    outputDir: null,
    port: DEFAULT_PORT,
    nodeVersion: parseNodeVersion(files, pkg),
    confidence: "low",
    notes,
  };
}

function detectDockerfile(
  files: ProjectFiles,
  base: DetectionResult,
): DetectionResult | null {
  const dockerfile = files.read("Dockerfile");
  if (dockerfile === null) return null;
  const exposed = dockerfile.match(/^\s*EXPOSE\s+(\d+)/im)?.[1];
  return {
    ...base,
    framework: "dockerfile",
    stack: "docker",
    port: exposed ? Number(exposed) : DEFAULT_PORT,
    confidence: "high",
    notes: [...base.notes, "Dockerfile found; it will be used as-is."],
  };
}

function detectNodeProject(
  files: ProjectFiles,
  pkg: PackageJson,
  base: DetectionResult,
): DetectionResult {
  const pm = base.packageManager;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};
  const has = (name: string) => name in deps;
  const hasServerLib = SERVER_LIBS.some(has);
  const isShopify = SHOPIFY_LIBS.some(has) || files.exists("shopify.app.toml");

  const common = {
    ...base,
    stack: isShopify ? ("shopify" as const) : stackFromDependencies(deps),
    installCommand: installCommandFor(pm, files),
    buildCommand: scripts.build ? runScript(pm, "build") : null,
  };

  if (isShopify) {
    const start = scripts["docker-start"] ? "docker-start" : "start";
    return {
      ...common,
      framework: "shopify",
      startCommand: runScript(pm, start),
      confidence: "high",
      notes: [...base.notes, SHOPIFY_NOTE],
    };
  }

  if (has("next")) {
    return {
      ...common,
      framework: "nextjs",
      startCommand: runScript(pm, "start"),
      confidence: "high",
    };
  }

  if (has("vite") && !hasServerLib && !scripts.start) {
    return {
      ...common,
      framework: "vite",
      kind: "static",
      outputDir: "dist",
      startCommand: null,
      confidence: "high",
    };
  }

  if (scripts.start) {
    return {
      ...common,
      framework: hasServerLib ? "express" : "node",
      startCommand: runScript(pm, "start"),
      confidence: hasServerLib ? "high" : "medium",
    };
  }

  const entry = pkg.main ?? (files.exists("index.js") ? "index.js" : null);
  if (entry && files.exists(entry)) {
    return {
      ...common,
      framework: "node",
      startCommand: `node ${entry}`,
      confidence: "medium",
    };
  }

  return {
    ...common,
    notes: [...base.notes, "No start script or entry file found; set the start command manually."],
  };
}

export function detectProject(files: ProjectFiles): DetectionResult {
  const notes: string[] = [];
  const pkg = parsePackageJson(files, notes);
  const base = emptyResult(files, pkg, notes);

  const dockerResult = detectDockerfile(files, base);
  if (dockerResult) return dockerResult;

  if (pkg) return detectNodeProject(files, pkg, base);

  if (files.exists("index.html")) {
    return {
      ...base,
      framework: "static",
      stack: "html",
      kind: "static",
      outputDir: ".",
      confidence: "high",
    };
  }

  return { ...base, notes: [...notes, "Could not recognise this project type."] };
}
