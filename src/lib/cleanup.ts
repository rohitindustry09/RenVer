/**
 * What can be safely cleaned from the server's disk, worked out from Docker's own report. Pure: nothing here runs a
 * command. Only things RenVer can account for are offered; other tools' volumes are counted but never touched.
 */

export type CleanupCategoryId = "buildCache" | "images" | "appVolumes" | "renverVolumes";

export interface CleanupItem {
  /** The name Docker uses (volumes are removed by this name); for other items just a label. */
  id: string;
  label: string;
  detail: string;
  bytes: number;
}

export interface CleanupCategory {
  id: CleanupCategoryId;
  title: string;
  summary: string;
  bytes: number;
  /** How many things are in it (items below can be a shorter list of the biggest ones). */
  count: number;
  items: CleanupItem[];
  /** True when it may hold someone's data, not just downloaded or rebuilt files. */
  containsData: boolean;
  dataNote: string;
  /** Volumes are chosen one by one; the other categories are all or nothing. */
  pickItems: boolean;
  defaultSelected: boolean;
}

export interface CleanupScan {
  categories: CleanupCategory[];
  /** Everything the categories could free. */
  totalBytes: number;
  /** Unused volumes that belong to other tools. Never touched. */
  other: { count: number; bytes: number };
}

export interface DockerDf {
  /** `bytes` is what removing the image frees (its own layers); `fullBytes` is its whole size, as `docker images` shows. */
  images: { repository: string; tag: string; id: string; containers: number; bytes: number; fullBytes: number }[];
  /** `bytes` is the container's own writable layer, not its image. */
  containers: { name: string; image: string; bytes: number }[];
  volumes: { name: string; links: number; bytes: number; isAnonymous: boolean }[];
  buildCache: { description: string; inUse: boolean; bytes: number }[];
}

const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
const MAX_LISTED = 8;
const RENVER_VOLUME_PREFIXES = ["renver-db-", "renver-vol-"];

/** "646MB", "20.5kB" and "0B" (Docker's sizes) as a number of bytes; anything else is 0. */
export function parseDockerSize(text: unknown): number {
  const match = /^\s*([\d.]+)\s*([A-Za-z]+)\s*$/.exec(String(text ?? ""));
  const unit = match ? UNITS[match[2]!.toLowerCase()] : undefined;
  const value = match ? Number(match[1]) : NaN;
  return unit !== undefined && Number.isFinite(value) ? Math.round(value * unit) : 0;
}

type Loose = Record<string, unknown>;
const list = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** The shape of `docker system df -v --format json`, tolerant of missing parts. */
export function parseDockerDf(raw: unknown): DockerDf {
  const root = (raw ?? {}) as Loose;
  return {
    images: list(root.Images).map((i) => ({
      repository: str(i.Repository),
      tag: str(i.Tag),
      id: str(i.ID),
      containers: Number(i.Containers) || 0,
      bytes: parseDockerSize(i.UniqueSize) || parseDockerSize(i.Size),
      fullBytes: parseDockerSize(i.Size),
    })),
    containers: list(root.Containers).map((k) => ({
      name: str(k.Names).split(",")[0] ?? "",
      image: str(k.Image),
      // Older Docker versions print "20.5kB (virtual 646MB)"; only the first part is the writable layer.
      bytes: parseDockerSize(str(k.Size).split(" ")[0]),
    })),
    volumes: list(root.Volumes).map((v) => ({
      name: str(v.Name),
      links: Number(v.Links) || 0,
      bytes: parseDockerSize(v.Size),
      isAnonymous: str(v.Labels).includes("com.docker.volume.anonymous") || /^[0-9a-f]{64}$/.test(str(v.Name)),
    })),
    buildCache: list(root.BuildCache).map((c) => ({
      description: str(c.Description),
      inUse: str(c.InUse) === "true",
      bytes: parseDockerSize(c.Size),
    })),
  };
}

const sum = (items: { bytes: number }[]): number => items.reduce((total, item) => total + item.bytes, 0);
const biggest = (items: CleanupItem[]): CleanupItem[] => [...items].sort((a, b) => b.bytes - a.bytes).slice(0, MAX_LISTED);
const shortId = (id: string): string => id.replace(/^sha256:/, "").slice(0, 12);

export function isRenverVolume(name: string): boolean {
  return RENVER_VOLUME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** The volumes that may be removed: unused by any container, and either RenVer's own but no longer referenced, or left behind by a removed container. */
export function removableVolumes(df: DockerDf, referenced: ReadonlySet<string>): { app: DockerDf["volumes"]; renver: DockerDf["volumes"] } {
  const unused = df.volumes.filter((v) => v.links === 0);
  return {
    app: unused.filter((v) => v.isAnonymous),
    renver: unused.filter((v) => !v.isAnonymous && isRenverVolume(v.name) && !referenced.has(v.name)),
  };
}

export function planCleanup(df: DockerDf, referencedVolumes: ReadonlySet<string>): CleanupScan {
  const cache = df.buildCache.filter((c) => !c.inUse && c.bytes > 0);
  const images = df.images.filter((i) => i.containers === 0);
  const { app, renver } = removableVolumes(df, referencedVolumes);
  const removable = new Set([...app, ...renver].map((v) => v.name));
  const other = df.volumes.filter((v) => v.links === 0 && !removable.has(v.name) && !referencedVolumes.has(v.name));

  const categories: CleanupCategory[] = [
    {
      id: "buildCache",
      title: "Build cache",
      summary: "Downloaded packages and build steps kept to make the next deploy faster. They are made again when needed, so the next deploy of each app is slower once.",
      bytes: sum(cache),
      count: cache.length,
      items: biggest(cache.map((c, i) => ({ id: `cache-${i}`, label: c.description.slice(0, 90) || "Build step", detail: "unused build cache", bytes: c.bytes }))),
      containsData: false,
      dataNote: "No personal data. It holds copies of the files and packages your builds used, which can be rebuilt from your sources.",
      pickItems: false,
      defaultSelected: true,
    },
    {
      id: "images",
      title: "Unused images",
      summary: "Built app images and downloaded base images (like node or postgres versions) that no app or database uses. Anything needed again is rebuilt or downloaded again. Images made in the last hour are kept.",
      bytes: sum(images),
      count: images.length,
      items: biggest(images.map((i) => ({ id: i.id, label: i.repository && i.repository !== "<none>" ? `${i.repository}:${i.tag}` : `untagged image ${shortId(i.id)}`, detail: "used by no container", bytes: i.bytes }))),
      containsData: false,
      dataNote: "No stored data, but an image holds your app's code. If a secret was ever baked into an image, removing it is a good thing.",
      pickItems: false,
      defaultSelected: true,
    },
    {
      id: "appVolumes",
      title: "Leftover app volumes",
      summary: "Storage that was created for an app container that has since been removed (for example by an older deploy). Nothing uses it any more.",
      bytes: sum(app),
      count: app.length,
      items: app.map((v) => ({ id: v.name, label: `volume ${shortId(v.name)}`, detail: "left by a removed container", bytes: v.bytes })).sort((a, b) => b.bytes - a.bytes),
      containsData: true,
      dataNote: "May hold files an old app wrote. Look at the size and age before you remove it. This cannot be undone.",
      pickItems: true,
      defaultSelected: false,
    },
    {
      id: "renverVolumes",
      title: "Unused RenVer volumes",
      summary: "RenVer storage (database or saved-folder volumes) that no database or project in RenVer refers to any more.",
      bytes: sum(renver),
      count: renver.length,
      items: renver.map((v) => ({ id: v.name, label: v.name, detail: "no database or project uses it", bytes: v.bytes })).sort((a, b) => b.bytes - a.bytes),
      containsData: true,
      dataNote: "Can hold database files or saved folders from something that was deleted. This cannot be undone.",
      pickItems: true,
      defaultSelected: false,
    },
  ];

  const shown = categories.filter((c) => c.count > 0);
  return { categories: shown, totalBytes: sum(shown), other: { count: other.length, bytes: sum(other) } };
}
