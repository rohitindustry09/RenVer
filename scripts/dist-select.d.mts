export const DIST_DIRS: readonly string[];
export function pickDistDir(root: string): string;
export function inactiveDistDir(root: string): string;
export function markBuildGood(root: string, dir: string): void;
export function markBuildBad(root: string, dir: string): void;
