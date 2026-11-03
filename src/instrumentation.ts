/** Runs once when the server starts. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundWork } = await import("./instrumentation-node");
    await startBackgroundWork();
  }
}
