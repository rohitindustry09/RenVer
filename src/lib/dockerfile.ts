import type { DetectionResult } from "./detect";

export interface DockerfileOptions {
  envKeys: readonly string[];
}

export interface GeneratedDockerfile {
  dockerfile: string;
  extraFiles: Record<string, string>;
  port: number;
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NODE_VERSION_PATTERN = /^\d{1,2}$/;
const OUTPUT_DIR_PATTERN = /^[\w./-]+$/;
const NGINX_CONF_NAME = "renver-nginx.conf";
const NGINX_CONF = `server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri /index.html;
  }
}
`;
const STATIC_PORT = 80;

function baseImage(det: DetectionResult): string {
  if (!NODE_VERSION_PATTERN.test(det.nodeVersion)) {
    throw new Error(`Invalid Node version: ${det.nodeVersion}`);
  }
  return det.packageManager === "bun" ? "oven/bun:1" : `node:${det.nodeVersion}-slim`;
}

function buildArgLines(envKeys: readonly string[]): string[] {
  return envKeys
    .filter((key) => ENV_KEY_PATTERN.test(key))
    .flatMap((key) => [`ARG ${key}`, `ENV ${key}=$${key}`]);
}

function toolchainLines(det: DetectionResult): string[] {
  const needsCorepack = det.packageManager === "pnpm" || det.packageManager === "yarn";
  return needsCorepack ? ["RUN corepack enable"] : [];
}

function installAndBuild(det: DetectionResult): string[] {
  return [
    ...(det.installCommand ? [`RUN ${det.installCommand}`] : []),
    ...(det.buildCommand ? [`RUN ${det.buildCommand}`] : []),
  ];
}

function serverDockerfile(det: DetectionResult, options: DockerfileOptions): GeneratedDockerfile {
  if (!det.startCommand) {
    throw new Error("A start command is required for server apps.");
  }
  const lines = [
    `FROM ${baseImage(det)}`,
    "WORKDIR /app",
    "RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*",
    ...toolchainLines(det),
    ...buildArgLines(options.envKeys),
    "COPY . .",
    ...installAndBuild(det),
    `ENV NODE_ENV=production PORT=${det.port} HOST=0.0.0.0 HOSTNAME=0.0.0.0`,
    `EXPOSE ${det.port}`,
    `CMD ["sh", "-c", ${JSON.stringify(det.startCommand)}]`,
  ];
  return { dockerfile: `${lines.join("\n")}\n`, extraFiles: {}, port: det.port };
}

function staticDockerfile(det: DetectionResult, options: DockerfileOptions): GeneratedDockerfile {
  const outputDir = det.outputDir ?? ".";
  if (!OUTPUT_DIR_PATTERN.test(outputDir) || outputDir.includes("..")) {
    throw new Error(`Invalid output directory: ${outputDir}`);
  }
  const needsBuild = det.buildCommand !== null;
  const buildStage = needsBuild
    ? [
        `FROM ${baseImage(det)} AS build`,
        "WORKDIR /app",
        ...toolchainLines(det),
        ...buildArgLines(options.envKeys),
        "COPY . .",
        ...installAndBuild(det),
      ]
    : [];
  const copyLine = needsBuild
    ? `COPY --from=build /app/${outputDir} /usr/share/nginx/html`
    : `COPY ${outputDir} /usr/share/nginx/html`;
  const lines = [
    ...buildStage,
    "FROM nginx:alpine",
    copyLine,
    `COPY ${NGINX_CONF_NAME} /etc/nginx/conf.d/default.conf`,
    `EXPOSE ${STATIC_PORT}`,
  ];
  return {
    dockerfile: `${lines.join("\n")}\n`,
    extraFiles: { [NGINX_CONF_NAME]: NGINX_CONF },
    port: STATIC_PORT,
  };
}

/** Returns null when the project's own Dockerfile should be used as-is. */
export function generateDockerfile(
  det: DetectionResult,
  options: DockerfileOptions,
): GeneratedDockerfile | null {
  if (det.framework === "dockerfile") return null;
  return det.kind === "static" ? staticDockerfile(det, options) : serverDockerfile(det, options);
}
