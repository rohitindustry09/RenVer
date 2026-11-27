// Keeps the panel running. The panel asks for a restart (after an update) by exiting with RESTART_EXIT_CODE; it is then
// started again on whichever build is newest. If a build that was just installed crashes within a few seconds, it is
// marked bad and the previous build is started instead, once, so a bad update cannot leave a remote machine dead.
export const RESTART_EXIT_CODE = 75;
const GRACE_MS = 20_000;

export async function supervise({ pick, spawnChild, markBad, now = Date.now, log = () => {}, graceMs = GRACE_MS }) {
  let isAfterRestart = false;
  let hasFallenBack = false;
  for (;;) {
    const dir = pick();
    const startedAt = now();
    const { code, signal } = await spawnChild(dir);

    if (code === RESTART_EXIT_CODE) {
      isAfterRestart = true;
      log(`Restarting the panel (${new Date().toISOString()}).`);
      continue;
    }
    const crashedAtOnce = isAfterRestart && !signal && code !== 0 && now() - startedAt < graceMs;
    if (crashedAtOnce && !hasFallenBack) {
      hasFallenBack = true;
      markBad(dir);
      log(`The new build (${dir ?? "default"}) stopped within seconds (exit ${code}). Going back to the previous build.`);
      continue;
    }
    return { code, signal };
  }
}
