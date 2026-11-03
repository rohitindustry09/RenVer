/** Pause stops the app completely until it is resumed; restart is a quick stop-and-start. */
export type PowerAction = "pause" | "resume" | "restart";

export const POWER_ACTIONS: readonly PowerAction[] = ["pause", "resume", "restart"];
