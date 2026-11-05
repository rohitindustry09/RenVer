import { describe, expect, it } from "vitest";
import { isRenverVolume, parseDockerDf, parseDockerSize, planCleanup, removableVolumes } from "@/lib/cleanup";

const ANON = "9668e496b37767f3e204f222aaa06ca5a8bc94f6417d840764d8ed0ee02d5b9e";

const df = parseDockerDf({
  Images: [
    { Repository: "postgres", Tag: "17", ID: "sha256:aaaa", Containers: "1", Size: "646MB", UniqueSize: "645.8MB" },
    { Repository: "renver/old-app", Tag: "abc123", ID: "sha256:bbbb1111cccc2222", Containers: "0", Size: "300MB", UniqueSize: "120MB" },
    { Repository: "<none>", Tag: "<none>", ID: "sha256:dddd3333eeee4444", Containers: "0", Size: "50MB", UniqueSize: "50MB" },
  ],
  Volumes: [
    { Name: "renver-db-shop", Links: "1", Size: "47.59MB", Labels: "" },
    { Name: "renver-db-paused", Links: "0", Size: "30MB", Labels: "" },
    { Name: "renver-db-deleted", Links: "0", Size: "20MB", Labels: "" },
    { Name: "renver-vol-p1-ab12cd34", Links: "0", Size: "5MB", Labels: "" },
    { Name: ANON, Links: "0", Size: "47.82MB", Labels: "com.docker.volume.anonymous=" },
    { Name: "wordpress-data", Links: "0", Size: "208.8MB", Labels: "com.docker.compose.project=wp" },
    { Name: "in-use-anon", Links: "2", Size: "9MB", Labels: "com.docker.volume.anonymous=" },
  ],
  BuildCache: [
    { Description: "pulled from docker.io/library/node:22-slim", InUse: "false", Size: "114MB" },
    { Description: "RUN npm ci", InUse: "false", Size: "400MB" },
    { Description: "running build step", InUse: "true", Size: "90MB" },
  ],
});

const referenced = new Set(["renver-db-shop", "renver-db-paused", "renver-vol-p1-ab12cd34"]);

describe("parseDockerSize", () => {
  it("reads Docker's sizes", () => {
    expect(parseDockerSize("646MB")).toBe(646_000_000);
    expect(parseDockerSize("20.5kB")).toBe(20_500);
    expect(parseDockerSize("1.2GB")).toBe(1_200_000_000);
    expect(parseDockerSize("0B")).toBe(0);
  });

  it("treats anything else as zero", () => {
    for (const bad of ["", "N/A", "abc", undefined, null, "12 parsecs"]) expect(parseDockerSize(bad)).toBe(0);
  });
});

describe("parseDockerDf", () => {
  it("copes with missing parts", () => {
    expect(parseDockerDf({})).toEqual({ images: [], volumes: [], buildCache: [] });
    expect(parseDockerDf(null).images).toEqual([]);
  });

  it("spots anonymous volumes by label or by their 64-hex name", () => {
    expect(df.volumes.find((v) => v.name === ANON)?.isAnonymous).toBe(true);
    expect(parseDockerDf({ Volumes: [{ Name: ANON, Links: "0", Size: "1MB", Labels: "" }] }).volumes[0]?.isAnonymous).toBe(true);
    expect(df.volumes.find((v) => v.name === "wordpress-data")?.isAnonymous).toBe(false);
  });

  it("uses the unique size of an image, which is what removing it frees", () => {
    expect(df.images.find((i) => i.repository === "renver/old-app")?.bytes).toBe(120_000_000);
  });
});

describe("removableVolumes", () => {
  it("offers unused anonymous volumes and unreferenced RenVer volumes, nothing else", () => {
    const { app, renver } = removableVolumes(df, referenced);
    expect(app.map((v) => v.name)).toEqual([ANON]);
    expect(renver.map((v) => v.name)).toEqual(["renver-db-deleted"]);
  });

  it("never offers a volume a container uses, one RenVer still refers to, or another tool's volume", () => {
    const all = removableVolumes(df, referenced);
    const names = [...all.app, ...all.renver].map((v) => v.name);
    for (const kept of ["renver-db-shop", "renver-db-paused", "renver-vol-p1-ab12cd34", "wordpress-data", "in-use-anon"]) expect(names).not.toContain(kept);
  });

  it("recognises RenVer's own volume names", () => {
    expect(isRenverVolume("renver-db-x")).toBe(true);
    expect(isRenverVolume("renver-vol-p-1")).toBe(true);
    expect(isRenverVolume("wordpress-data")).toBe(false);
  });
});

describe("planCleanup", () => {
  const plan = planCleanup(df, referenced);
  const category = (id: string) => plan.categories.find((c) => c.id === id)!;

  it("counts only unused build cache and unused images", () => {
    expect(category("buildCache")).toMatchObject({ bytes: 514_000_000, count: 2, containsData: false, defaultSelected: true });
    expect(category("images")).toMatchObject({ bytes: 170_000_000, count: 2, containsData: false });
    expect(category("images").items.map((i) => i.label)).toEqual(["renver/old-app:abc123", "untagged image dddd3333eeee"]);
  });

  it("marks volumes as possibly holding data, chosen one by one and never ticked for you", () => {
    for (const id of ["appVolumes", "renverVolumes"]) expect(category(id)).toMatchObject({ containsData: true, pickItems: true, defaultSelected: false });
    expect(category("renverVolumes").items.map((i) => i.id)).toEqual(["renver-db-deleted"]);
  });

  it("reports other tools' unused volumes without offering them", () => {
    expect(plan.other).toEqual({ count: 1, bytes: 208_800_000 });
    expect(plan.categories.flatMap((c) => c.items.map((i) => i.id))).not.toContain("wordpress-data");
  });

  it("totals what the categories would free, and leaves out empty categories", () => {
    expect(plan.totalBytes).toBe(514_000_000 + 170_000_000 + 47_820_000 + 20_000_000);
    expect(planCleanup(parseDockerDf({}), new Set()).categories).toEqual([]);
  });
});
