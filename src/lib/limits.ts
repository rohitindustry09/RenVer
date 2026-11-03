/** Client-safe rules for the resource limits that apply to every deployed app. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface Limits {
  /** Memory per app container, as Docker writes it: 512m, 1g. */
  memory: string;
  /** CPUs per app container: 0.5, 1, 2. */
  cpus: string;
  /** The first local port handed to an app. Each new app gets the next free one. */
  hostPortStart: number;
}

/** Every database container gets this much memory (see dockerRunDatabase). */
export const DATABASE_MEMORY_MB = 1024;

const MIN_MEMORY_MB = 64;
const MAX_MEMORY_MB = 64 * 1024;
const MIN_CPUS = 0.1;
const MIN_PORT = 1024;
const MAX_PORT_START = 64000;
const MB_PER_GB = 1024;

/** "512", "1.5g" and "512 MB" become a size Docker accepts, with GB used when it divides evenly. */
export function validateMemory(input: string): Checked<string> {
  const match = /^(\d+(?:\.\d+)?)\s*(m|mb|g|gb)$/i.exec(input.trim());
  if (!match) return { ok: false, error: "Use a size with a unit, like 512m or 1g." };

  const amount = Number(match[1]);
  const megabytes = Math.round(match[2]!.toLowerCase().startsWith("g") ? amount * MB_PER_GB : amount);
  if (megabytes < MIN_MEMORY_MB || megabytes > MAX_MEMORY_MB) {
    return { ok: false, error: "Memory must be between 64m and 64g." };
  }
  return { ok: true, value: megabytes % MB_PER_GB === 0 ? `${megabytes / MB_PER_GB}g` : `${megabytes}m` };
}

/** Megabytes in a size like 512m or 1g, or null if it is not one. */
export function memoryToMb(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([mg])$/i.exec(value.trim());
  if (!match) return null;
  return Math.round(Number(match[1]) * (match[2]!.toLowerCase() === "g" ? MB_PER_GB : 1));
}

export function validateCpus(input: string, maxCpus: number): Checked<string> {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Use a number like 0.5 or 2." };

  const cpus = Number(text);
  if (cpus < MIN_CPUS) return { ok: false, error: "CPUs must be at least 0.1." };
  if (cpus > maxCpus) return { ok: false, error: `This machine only has ${maxCpus} CPU${maxCpus === 1 ? "" : "s"}.` };
  return { ok: true, value: String(Math.round(cpus * 100) / 100) };
}

export function validatePortStart(input: string | number): Checked<number> {
  const text = String(input).trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter a whole number." };

  const port = Number(text);
  if (port < MIN_PORT || port > MAX_PORT_START) {
    return { ok: false, error: `Choose a port between ${MIN_PORT} and ${MAX_PORT_START}.` };
  }
  return { ok: true, value: port };
}

export type LimitsResult = { ok: true; value: Limits } | { ok: false; errors: Partial<Record<keyof Limits, string>> };

export function validateLimits(
  input: { memory: string; cpus: string; hostPortStart: string | number },
  hostCpus: number,
): LimitsResult {
  const memory = validateMemory(input.memory);
  const cpus = validateCpus(input.cpus, hostCpus);
  const port = validatePortStart(input.hostPortStart);
  if (memory.ok && cpus.ok && port.ok) {
    return { ok: true, value: { memory: memory.value, cpus: cpus.value, hostPortStart: port.value } };
  }
  const errors: Partial<Record<keyof Limits, string>> = {};
  if (!memory.ok) errors.memory = memory.error;
  if (!cpus.ok) errors.cpus = cpus.error;
  if (!port.ok) errors.hostPortStart = port.error;
  return { ok: false, errors };
}

/** What a single project may override. A missing value means "use the global limit". */
export interface ProjectLimits {
  memory?: string;
  cpus?: string;
}

export function effectiveLimits(global: Pick<Limits, "memory" | "cpus">, override: ProjectLimits | undefined): { memory: string; cpus: string } {
  return { memory: override?.memory ?? global.memory, cpus: override?.cpus ?? global.cpus };
}

export type ProjectLimitsResult =
  | { ok: true; value: ProjectLimits }
  | { ok: false; errors: Partial<Record<keyof ProjectLimits, string>> };

/** Blank fields mean "use the default", so they are left out of the result. */
export function validateProjectLimits(input: { memory: string; cpus: string }, hostCpus: number): ProjectLimitsResult {
  const value: ProjectLimits = {};
  const errors: Partial<Record<keyof ProjectLimits, string>> = {};
  if (input.memory.trim()) {
    const memory = validateMemory(input.memory);
    if (memory.ok) value.memory = memory.value;
    else errors.memory = memory.error;
  }
  if (input.cpus.trim()) {
    const cpus = validateCpus(input.cpus, hostCpus);
    if (cpus.ok) value.cpus = cpus.value;
    else errors.cpus = cpus.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
