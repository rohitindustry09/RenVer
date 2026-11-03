export function isPortFree(port: number, host?: string): Promise<boolean>;
export function findFreePort(
  preferred: number,
  options?: { isFree?: (port: number) => Promise<boolean>; attempts?: number },
): Promise<number>;
export function readLock(file: string): { pid: number; port: number } | null;
export function isPidAlive(pid: number): boolean;
