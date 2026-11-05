import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  projects: [] as { id: string; status: string; config: { storage?: string[] } }[],
  databases: [] as { volume: string }[],
}));

vi.mock("@/lib/db", () => ({
  listProjects: () => state.projects,
  listDatabaseRecords: () => state.databases,
}));

const ANON = "a".repeat(64);

/** A pretend Docker: remembers what was asked, and answers `system df` from a small world that shrinks as things are removed. */
function fakeDocker() {
  const world = {
    cache: [{ Description: "step", InUse: "false", Size: "100MB" }],
    images: [{ Repository: "old", Tag: "1", ID: "sha256:1", Containers: "0", Size: "50MB", UniqueSize: "50MB" }],
    volumes: [
      { Name: ANON, Links: "0", Size: "40MB", Labels: "com.docker.volume.anonymous=" },
      { Name: "renver-db-gone", Links: "0", Size: "10MB", Labels: "" },
      { Name: "renver-db-live", Links: "0", Size: "30MB", Labels: "" },
      { Name: "wordpress-data", Links: "0", Size: "200MB", Labels: "" },
    ],
  };
  const calls: string[][] = [];
  const docker = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "system") return JSON.stringify({ BuildCache: world.cache, Images: world.images, Volumes: world.volumes });
    if (args[0] === "builder") world.cache = [];
    if (args[0] === "image") world.images = [];
    if (args[0] === "volume") world.volumes = world.volumes.filter((v) => v.Name !== args[2]);
    return "";
  };
  return { docker, calls };
}

const run = async (request: { buildCache: boolean; images: boolean; volumes: string[] }, docker: (args: string[]) => Promise<string>) =>
  (await import("@/lib/cleanup-run")).runCleanup(request, docker as never);

beforeEach(() => {
  state.projects = [];
  state.databases = [{ volume: "renver-db-live" }];
});

describe("runCleanup", () => {
  it("refuses while a deploy is running, and runs nothing", async () => {
    state.projects = [{ id: "p", status: "deploying", config: {} }];
    const { docker, calls } = fakeDocker();
    await expect(run({ buildCache: true, images: true, volumes: [] }, docker)).rejects.toThrow("deploy is running");
    expect(calls).toEqual([]);
  });

  it("does only what was chosen, with Docker's own safe commands, and reports what was freed", async () => {
    const { docker, calls } = fakeDocker();
    const result = await run({ buildCache: true, images: true, volumes: [] }, docker);
    const actions = calls.filter((c) => c[0] !== "system");
    expect(actions).toEqual([
      ["builder", "prune", "--force"],
      ["image", "prune", "--all", "--force", "--filter", "until=1h"],
    ]);
    expect(result.freedBytes).toBe(150_000_000);
    expect(result.steps.every((s) => s.ok)).toBe(true);
  });

  it("removes a chosen leftover volume, but skips one RenVer still needs and another tool's", async () => {
    const { docker, calls } = fakeDocker();
    const result = await run({ buildCache: false, images: false, volumes: [ANON, "renver-db-live", "wordpress-data", "not-real"] }, docker);
    expect(calls.filter((c) => c[0] === "volume")).toEqual([["volume", "rm", ANON]]);
    expect(result.steps.filter((s) => !s.ok)).toHaveLength(3);
    expect(result.steps.find((s) => s.ok)?.label).toContain(ANON.slice(0, 14));
  });

  it("keeps a volume that a saved folder of a project refers to", async () => {
    const { volumeName } = await import("@/lib/volume-name");
    const saved = volumeName("p1", "/data");
    state.projects = [{ id: "p1", status: "running", config: { storage: ["/data"] } }];
    const { docker, calls } = fakeDocker();
    // Make the fake world contain that volume as an unused RenVer volume.
    const wrapped = async (args: string[]) => {
      const out = await docker(args);
      if (args[0] !== "system") return out;
      const world = JSON.parse(out) as { Volumes: unknown[] };
      world.Volumes.push({ Name: saved, Links: "0", Size: "5MB", Labels: "" });
      return JSON.stringify(world);
    };
    const result = await run({ buildCache: false, images: false, volumes: [saved] }, wrapped);
    expect(calls.filter((c) => c[0] === "volume")).toEqual([]);
    expect(result.steps[0]?.ok).toBe(false);
  });

  it("reports a failed step without stopping the others", async () => {
    const { docker } = fakeDocker();
    const failing = async (args: string[]) => {
      if (args[0] === "builder") throw new Error("busy");
      return docker(args);
    };
    const result = await run({ buildCache: true, images: true, volumes: [] }, failing);
    expect(result.steps.map((s) => s.ok)).toEqual([false, true]);
    expect(result.steps[0]?.message).toBe("busy");
  });
});
