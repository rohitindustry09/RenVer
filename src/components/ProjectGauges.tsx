import type { LiveProject, LiveUsage } from "@/lib/live-usage";
import { formatBytes } from "@/lib/format";
import { formatMB, gaugeTone, ratioOf } from "@/lib/gauge";
import { Gauge } from "./Gauge";
import { Skeleton } from "./Skeleton";

interface Props {
  isRunning: boolean;
  /** Null while the first reading is on its way. */
  live: LiveUsage | null;
  project: LiveProject | undefined;
}

// A project's share of the whole server disk is small, so the colour only warns for a large share.
const DISK_WARN_AT = 0.25;
const DISK_BAD_AT = 0.5;

function Stat({ title, hint, ratio, tone, value, sub }: { title: string; hint?: string; ratio: number; tone: "ok" | "warn" | "bad" | "idle"; value: string; sub: string }) {
  return (
    <div className="gauge-stat" title={hint}>
      <Gauge ratio={ratio} tone={tone} label={title} />
      <span className="gauge-text">
        <span className="gauge-title">{title}</span>
        <span className="gauge-value">{value}</span>
        <span className="gauge-sub">{sub}</span>
      </span>
    </div>
  );
}

/** Two round meters for a project card: memory in use now against its limit, and disk held against the server's disk. */
export function ProjectGauges({ isRunning, live, project }: Props) {
  if (!live || !project) {
    return (
      <div className="card-gauges" aria-hidden="true">
        {[0, 1].map((i) => (
          <div className="gauge-stat" key={i}>
            <Skeleton width={44} height={44} circle />
            <span className="gauge-text"><Skeleton width={56} height={10} /><Skeleton width={84} height={12} /></span>
          </div>
        ))}
      </div>
    );
  }

  const memory = project.memory;
  const memoryRatio = memory ? ratioOf(memory.usedMB, memory.limitMB) : 0;
  const disk = project.disk;
  const diskRatio = disk ? ratioOf(disk.bytes, live.server.diskTotalBytes) : 0;

  return (
    <div className="card-gauges">
      <Stat
        title="Memory"
        hint={memory ? `Using ${formatMB(memory.usedMB)} right now. This app may use at most ${formatMB(memory.limitMB)}.` : "Not running, so it uses no memory."}
        ratio={memoryRatio}
        tone={memory ? gaugeTone(memoryRatio) : "idle"}
        value={memory ? `${formatMB(memory.usedMB)} / ${formatMB(memory.limitMB)}` : isRunning ? "Reading…" : "Not running"}
        sub={memory ? "in use / its limit" : "no memory in use"}
      />
      <Stat
        title="Space"
        hint={
          disk
            ? `Image ${formatBytes(disk.image)} · container ${formatBytes(disk.writable)} · saved folders ${formatBytes(disk.volumes)} · saved source copies ${formatBytes(disk.sources)}. Parts of an image shared with other apps (like Node) are counted in each.`
            : "Docker could not report this."
        }
        ratio={diskRatio}
        tone={disk ? gaugeTone(diskRatio, DISK_WARN_AT, DISK_BAD_AT) : "idle"}
        value={disk ? formatBytes(disk.bytes) : "—"}
        sub={disk ? `of ${formatBytes(live.server.diskTotalBytes)} server disk` : "unknown"}
      />
    </div>
  );
}
