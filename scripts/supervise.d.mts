export const RESTART_EXIT_CODE: number;
export function supervise(options: {
  pick: () => string | null;
  spawnChild: (dir: string) => Promise<{ code: number | null; signal: string | null }>;
  markBad: (dir: string) => void;
  now?: () => number;
  log?: (line: string) => void;
  graceMs?: number;
}): Promise<{ code: number | null; signal: string | null }>;
