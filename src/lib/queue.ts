const globalQueue = globalThis as typeof globalThis & { __renverQueue?: Promise<void> };

/**
 * Runs jobs one at a time so concurrent builds cannot starve the machine.
 * The tail lives on globalThis so separately bundled route handlers share one queue.
 * A failing job is logged and never blocks the jobs behind it.
 */
export function enqueue(job: () => Promise<void>): Promise<void> {
  const next = (globalQueue.__renverQueue ?? Promise.resolve())
    .then(job)
    .catch((error: unknown) => {
      process.stderr.write(`[renver] queued job failed: ${error instanceof Error ? error.stack : String(error)}\n`);
    });
  globalQueue.__renverQueue = next;
  return next;
}
