import type { ProjectConfig } from "./db";
import type { DetectionResult } from "./detect";

const MAX_COMMAND_LENGTH = 500;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CONTROL_CHARS = /[\r\n\0]/;

const RESERVED_ENV_KEY = /^(DOCKER_|LD_|DYLD_)|^(PATH|PATHEXT|HOME|USERPROFILE|COMSPEC|SYSTEMROOT|NODE_OPTIONS|TMP|TEMP)$/i;

/** Keys that would change how the docker CLI or the host process behaves. */
export function isReservedEnvKey(key: string): boolean {
  return RESERVED_ENV_KEY.test(key);
}

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

function parseCommand(value: unknown, fallback: string | null, label: string): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_COMMAND_LENGTH) throw new Error(`${label} is too long.`);
  if (CONTROL_CHARS.test(trimmed)) throw new Error(`${label} must be a single line.`);
  return trimmed;
}

function parsePort(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(`Port must be a whole number between ${MIN_PORT} and ${MAX_PORT}.`);
  }
  return value;
}

export function parseProjectConfig(input: unknown, base: DetectionResult): ProjectConfig {
  const body = asRecord(input);
  return {
    framework: base.framework,
    stack: base.stack,
    kind: base.kind,
    packageManager: base.packageManager,
    nodeVersion: base.nodeVersion,
    installCommand: parseCommand(body.installCommand, base.installCommand, "Install command"),
    buildCommand: parseCommand(body.buildCommand, base.buildCommand, "Build command"),
    startCommand: parseCommand(body.startCommand, base.startCommand, "Start command"),
    outputDir: parseCommand(body.outputDir, base.outputDir, "Output directory"),
    port: parsePort(body.port, base.port),
  };
}

export function parseEnv(input: unknown): Record<string, string> {
  if (input === undefined || input === null) return {};
  const body = asRecord(input);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
    if (isReservedEnvKey(key)) throw new Error(`Environment variable ${key} is reserved.`);
    if (typeof value !== "string") throw new Error(`Environment variable ${key} must be a string.`);
    result[key] = value;
  }
  return result;
}
