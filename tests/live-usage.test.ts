import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDockerDf } from "@/lib/cleanup";

const state = vi.hoisted(() => ({
  projects: [] as { id: string; status: string; container: string | null; config: { storage?: string[]; limits?: { memory?: string } } }[],
  databases: [] as { status: string; container: string }[],
}));

vi.mock("@/lib/db", () => ({
  listProjects: () => state.projects,
  listDatabaseRecords: () => state.databases,
  listDeployUploadRefs: () => [],
}));
vi.mock("@/lib/runtime-settings", () => ({ getLimits: () => ({ memory: "512m", cpus: "1", hostPortStart: 4001 }) }));

import { collectLiveUsage, parseImageSizes, parseMeminfo, parseStatsLines, projectDisk } from "@/lib/live-usage";
import { volumeName } from "@/lib/volume-name";

const IMAGE_TAG = "renver/shop:aaaaaaaa";
const CONTAINER = "renver-shop-aaaaaaaa";

const df = parseDockerDf({
  Images: [
    { Repository: "renver/shop", Tag: "aaaaaaaa", ID: "sha256:1", Containers: "1", Size: "300MB", UniqueSize: "120MB" },
    { Repository: "renver/other", Tag: "bbbbbbbb", ID: "sha256:2", Containers: "1", Size: "500MB", UniqueSize: "500MB" },
  ],
  Containers: [{ Names: CONTAINER, Image: IMAGE_TAG, Size: "12.5MB" }],
  Volumes: [{ Name: volumeName("p1", "/data"), Links: "1", Size: "40MB", Labels: "" }],
  BuildCache: [],
});

describe("parseStatsLines", () => {
  it("reads name, memory in use and the memory limit for every running container", () => {
    const map = parseStatsLines("renver-shop-aaaaaaaa|0.50%|182.4MiB / 512MiB\nrenver-db-x|1.20%|1.2GiB / 1GiB\nbroken line\n");
    expect(map.size).toBe(2);
    expect(map.get(CONTAINER)).toMatchObject({ memoryMB: 182.4, memoryLimitMB: 512 });
    expect(map.get("renver-db-x")?.memoryMB).toBeCloseTo(1228.8, 1);
  });

  it("gives an empty map for no output", () => {
    expect(parseStatsLines("").size).toBe(0);
  });
});

describe("parseImageSizes", () => {
  it("lists every tag, including several tags on one image", () => {
    const sizes = parseImageSizes("renver/shop|aaaaaaaa|300MB\nrenver/shop|cccccccc|300MB\n<none>|<none>|50MB\nbad line\n");
    expect(sizes.get("renver/shop:aaaaaaaa")).toBe(300_000_000);
    expect(sizes.get("renver/shop:cccccccc")).toBe(300_000_000);
    expect(sizes.size).toBe(3);
  });
});

describe("parseMeminfo", () => {
  it("counts memory the system can give back as free", () => {
    const text = "MemTotal:        3900000 kB\nMemFree:          200000 kB\nMemAvailable:    2400000 kB\n";
    expect(parseMeminfo(text)).toEqual({ totalMB: 3809, usedMB: 1465 });
  });

  it("is null when the numbers are missing", () => {
    expect(parseMeminfo("nothing useful")).toBeNull();
  });
});

describe("projectDisk", () => {
  const project = { id: "p1", container: CONTAINER, config: { storage: ["/data"] } };

  it("adds the app's image, its container's own layer, its saved folders and its saved sources", () => {
    expect(projectDisk(project, df, 2_000_000)).toEqual({
      bytes: 300_000_000 + 12_500_000 + 40_000_000 + 2_000_000,
      image: 300_000_000,
      writable: 12_500_000,
      volumes: 40_000_000,
      sources: 2_000_000,
    });
  });

  it("counts only that project's image, not another's, and nothing for a project with no container", () => {
    expect(projectDisk({ id: "p9", container: null, config: {} }, df, 0).bytes).toBe(0);
    expect(projectDisk({ id: "p9", container: "renver-nothing-cccccccc", config: {} }, df, 0).bytes).toBe(0);
  });
});

describe("projectDisk with per-tag image sizes", () => {
  it("finds an image that the system report lists only once", () => {
    const sizes = new Map([["renver/shop:aaaaaaaa", 640_000_000]]);
    const emptyDf = parseDockerDf({ Images: [], Containers: [], Volumes: [], BuildCache: [] });
    expect(projectDisk({ id: "p1", container: CONTAINER, config: {} }, emptyDf, 0, sizes).image).toBe(640_000_000);
  });
});

describe("collectLiveUsage", () => {
  beforeEach(() => {
    delete (globalThis as { __renverLive?: unknown }).__renverLive;
    state.projects = [
      { id: "p1", status: "running", container: CONTAINER, config: { storage: ["/data"] } },
      { id: "p2", status: "stopped", container: null, config: {} },
    ];
    state.databases = [{ status: "running", container: "renver-db-shop" }];
  });

  const docker = (calls: string[][]) => async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "image") return "renver/shop|aaaaaaaa|300MB\n";
    if (args[0] === "stats") return `${CONTAINER}|0.40%|182MiB / 512MiB\nrenver-db-shop|1.00%|300MiB / 1GiB\nunrelated|0%|900MiB / 2GiB\n`;
    return JSON.stringify({
      Images: [{ Repository: "renver/shop", Tag: "aaaaaaaa", ID: "sha256:1", Containers: "1", Size: "300MB", UniqueSize: "120MB" }],
      Containers: [{ Names: CONTAINER, Image: IMAGE_TAG, Size: "12.5MB" }],
      Volumes: [],
      BuildCache: [],
    });
  };

  it("reports each app's live memory against its limit, and totals only RenVer's own containers", async () => {
    const calls: string[][] = [];
    const usage = await collectLiveUsage(docker(calls));
    expect(usage.projects.p1?.memory).toEqual({ usedMB: 182, limitMB: 512 });
    expect(usage.projects.p2?.memory).toBeNull();
    expect(usage.memory).toMatchObject({ usedAppsMB: 182, usedDatabasesMB: 300, reservedAppsMB: 512, reservedDatabasesMB: 1024 });
    expect(usage.projects.p1?.disk?.image).toBe(300_000_000);
  });

  it("asks Docker once for several readings close together", async () => {
    const calls: string[][] = [];
    const run = docker(calls);
    await Promise.all([collectLiveUsage(run), collectLiveUsage(run)]);
    await collectLiveUsage(run);
    expect(calls.filter((c) => c[0] === "stats")).toHaveLength(1);
    expect(calls.filter((c) => c[0] === "system")).toHaveLength(1);
    expect(calls.filter((c) => c[0] === "image")).toHaveLength(1);
  });

  it("still answers for memory when Docker cannot give the disk report", async () => {
    const broken = async (args: string[]): Promise<string> => {
      if (args[0] === "system") throw new Error("df failed");
      return `${CONTAINER}|0.4%|100MiB / 512MiB\n`;
    };
    const usage = await collectLiveUsage(broken);
    expect(usage.projects.p1?.memory?.usedMB).toBe(100);
    expect(usage.projects.p1?.disk).toBeNull();
  });
});
