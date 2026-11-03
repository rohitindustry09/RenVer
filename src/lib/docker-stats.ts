export interface ContainerStats {
  cpuPercent: number;
  memoryMB: number;
  memoryLimitMB: number;
}

const UNIT_TO_MB: Record<string, number> = {
  b: 1 / (1024 * 1024),
  kib: 1 / 1024, kb: 1 / 1000,
  mib: 1, mb: 1,
  gib: 1024, gb: 1000,
  tib: 1024 * 1024, tb: 1000 * 1000,
};

function toMb(text: string): number | null {
  const m = /^([\d.]+)\s*([a-z]+)$/i.exec(text.trim());
  const factor = m ? UNIT_TO_MB[m[2]!.toLowerCase()] : undefined;
  return m && factor !== undefined ? Number(m[1]) * factor : null;
}

/** Reads one line of `docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}"`. */
export function parseDockerStats(line: string): ContainerStats | null {
  const [cpu, memory] = line.trim().split("|");
  const [used, limit] = (memory ?? "").split("/");
  const cpuPercent = Number.parseFloat(cpu ?? "");
  const memoryMB = toMb(used ?? "");
  const memoryLimitMB = toMb(limit ?? "");
  if (!Number.isFinite(cpuPercent) || memoryMB === null || memoryLimitMB === null) return null;
  return { cpuPercent, memoryMB, memoryLimitMB };
}
