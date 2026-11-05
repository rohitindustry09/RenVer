import { describe, expect, it } from "vitest";
import { reservedMemory } from "@/lib/reserved-memory";

const GLOBAL = { memory: "512m", cpus: "1" };
const app = (status: string, limits?: { memory?: string; cpus?: string }) => ({ status, config: { limits } });

describe("reservedMemory", () => {
  it("adds up what the running apps and databases may use, splitting apps from databases", () => {
    const result = reservedMemory([app("running"), app("running"), app("running"), app("running")], 3, GLOBAL);
    expect(result).toEqual({ appsMB: 2048, databasesMB: 3072, appsCpu: 4 });
  });

  it("counts an app's own limit instead of the global one", () => {
    const result = reservedMemory([app("running", { memory: "1g", cpus: "2" }), app("running")], 0, GLOBAL);
    expect(result.appsMB).toBe(1024 + 512);
    expect(result.appsCpu).toBe(3);
  });

  it("leaves out apps that are not running", () => {
    const result = reservedMemory([app("running"), app("stopped"), app("paused"), app("failed")], 1, GLOBAL);
    expect(result).toEqual({ appsMB: 512, databasesMB: 1024, appsCpu: 1 });
  });

  it("falls back to the global limit when an app's own value is unreadable", () => {
    expect(reservedMemory([app("running", { memory: "lots" })], 0, GLOBAL).appsMB).toBe(512);
  });
});
