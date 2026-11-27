// Which finished build the panel should run. Two build folders exist: ".next" (what `npm run build` makes) and
// ".next-alt". An update builds into the one that is NOT running, so the running panel is never disturbed, and the
// newer finished build wins at the next start. A folder without a BUILD_ID is an unfinished or failed build.
import fs from "node:fs";
import path from "node:path";

export const DIST_DIRS = [".next", ".next-alt"];

const buildIdPath = (root, dir) => path.join(root, dir, "BUILD_ID");

function builtAt(root, dir) {
  try {
    return fs.statSync(buildIdPath(root, dir)).mtimeMs;
  } catch {
    return null;
  }
}

/** The folder with the newest finished build; ".next" when there is none (or on a tie). */
export function pickDistDir(root) {
  let best = DIST_DIRS[0];
  let bestTime = -Infinity;
  for (const dir of DIST_DIRS) {
    const time = builtAt(root, dir);
    if (time !== null && time > bestTime) {
      best = dir;
      bestTime = time;
    }
  }
  return best;
}

/** The folder a new build should go into: the one that is not being run. */
export function inactiveDistDir(root) {
  const active = pickDistDir(root);
  return DIST_DIRS.find((dir) => dir !== active) ?? DIST_DIRS[1];
}

/** After a successful build: make it the newest, so the next start picks it. */
export function markBuildGood(root, dir) {
  const now = new Date();
  fs.utimesSync(buildIdPath(root, dir), now, now);
}

/** After a failed build or a build that crashes at startup: make sure it is never picked. */
export function markBuildBad(root, dir) {
  fs.rmSync(buildIdPath(root, dir), { force: true });
}
