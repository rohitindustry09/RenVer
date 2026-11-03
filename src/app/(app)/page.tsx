"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { ProjectCardMenu } from "@/components/ProjectCardMenu";
import { stackLabel, stackOf } from "@/lib/stack";
import { GithubIcon, GridIcon, ListIcon, SearchIcon, ZipIcon, BellIcon } from "@/components/shell/icons";
import { ProjectGridSkeleton, SidePanelSkeleton } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { useProjects } from "@/hooks/useProjects";
import type { ProjectListItem } from "@/lib/api";
import type { Alert } from "@/lib/alerts";
import type { DeployWithProject } from "@/lib/db";
import { formatBytes, isBusyStatus, statusLabel, timeAgo } from "@/lib/format";
import type { Usage } from "@/lib/usage";

const USAGE_REFRESH_MS = 15000;
const DEPLOYS_REFRESH_MS = 5000;
const WARN_RATIO = 0.75;
const BAD_RATIO = 0.9;
const RECENT_DEPLOYS = 6;
type ViewMode = "grid" | "list";

function meterClass(ratio: number): string {
  if (ratio >= BAD_RATIO) return "meter bad";
  if (ratio >= WARN_RATIO) return "meter warn";
  return "meter";
}

function Meter({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div className="meter-row">
      <div className="meter-head"><span>{label}</span><span className="muted mono">{value}</span></div>
      <div className={meterClass(ratio)} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const ratio = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

function UsageCard({ usage }: { usage: Usage }) {
  return (
    <section className="card" aria-labelledby="usage-heading">
      <div className="card-head"><h2 className="h3" id="usage-heading">Usage</h2><span className="small muted">{usage.deploys30d} deploys · 30d</span></div>
      <div style={{ padding: "4px 24px" }}>
        <Meter label="Memory reserved" value={`${(usage.memory.reservedMB / 1024).toFixed(1)} / ${(usage.memory.totalMB / 1024).toFixed(1)} GB`} ratio={ratio(usage.memory.reservedMB, usage.memory.totalMB)} />
        <Meter label="CPU reserved" value={`${usage.cpu.reserved.toFixed(1)} / ${usage.cpu.total} cores`} ratio={ratio(usage.cpu.reserved, usage.cpu.total)} />
        <Meter label="Disk used" value={`${formatBytes(usage.disk.totalBytes - usage.disk.freeBytes)} / ${formatBytes(usage.disk.totalBytes)}`} ratio={ratio(usage.disk.totalBytes - usage.disk.freeBytes, usage.disk.totalBytes)} />
        <div className="meter-row">
          <div className="meter-head"><span>Projects running</span><span className="muted mono">{usage.projects.running} / {usage.projects.total}</span></div>
          <div className="meter-head"><span>Databases running</span><span className="muted mono">{usage.databases.running} / {usage.databases.total}</span></div>
          <div className="meter-head"><span>Data folder</span><span className="muted mono">{formatBytes(usage.disk.dataBytes)}</span></div>
        </div>
      </div>
    </section>
  );
}

function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <section className="card" aria-labelledby="alerts-heading">
      <div className="card-head"><h2 className="h3" id="alerts-heading">Alerts</h2></div>
      {alerts.length === 0 ? (
        <div className="empty-note">
          <span className="icon-ring"><BellIcon size={18} /></span>
          <strong>All clear</strong>
          <span className="small">Nothing needs your attention right now.</span>
        </div>
      ) : (
        <div style={{ padding: "4px 24px" }}>
          {alerts.map((a) => {
            const body = (
              <>
                <span className={`dot ${a.severity === "error" ? "failed" : "creating"}`} aria-hidden="true" />
                <div><div style={{ fontWeight: 500 }}>{a.title}</div><div className="small muted">{a.detail}</div></div>
              </>
            );
            return a.href ? <Link key={a.id} href={a.href} className="alert-row">{body}</Link> : <div key={a.id} className="alert-row">{body}</div>;
          })}
        </div>
      )}
    </section>
  );
}

function RecentDeployments({ deploys }: { deploys: DeployWithProject[] }) {
  return (
    <section className="card" aria-labelledby="recent-heading">
      <div className="card-head"><h2 className="h3" id="recent-heading">Recent deployments</h2><Link href="/deployments" className="small muted">View all</Link></div>
      {deploys.length === 0 ? (
        <p className="sub" style={{ padding: "16px 24px" }}>No deployments yet.</p>
      ) : (
        deploys.map((d) => (
          <Link key={d.id} href={`/projects/${d.projectId}`} className="row">
            <span className={`dot ${d.status}${isBusyStatus(d.status) ? " pulse" : ""}`} aria-hidden="true" />
            <div className="row-main">
              <div style={{ fontWeight: 500 }}>{d.projectName}</div>
              <div className="small muted">{statusLabel(d.status)} · {timeAgo(d.createdAt)}</div>
            </div>
          </Link>
        ))
      )}
    </section>
  );
}

function ProjectCard({ project, onChanged }: { project: ProjectListItem; onChanged: () => void }) {
  const source = project.source;
  return (
    <div className="card link project-card">
      <div className="project-card-menu"><ProjectCardMenu project={project} onChanged={onChanged} /></div>
      <div className="top">
        <div className="project-icon"><FrameworkIcon stack={stackOf(project.config)} fallback={project.name} /></div>
        <div style={{ minWidth: 0, paddingRight: project.status === "running" ? 112 : 28 }}>
          <Link href={`/projects/${project.id}`} className="name card-link">{project.name}</Link>
          <div className="small muted mono ellipsis">{project.primaryHost}</div>
        </div>
      </div>
      <div className="card-lines">
        <div className="line">
          <span className={`dot ${project.status}${isBusyStatus(project.status) ? " pulse" : ""}`} aria-hidden="true" />
          <span className="ellipsis">{statusLabel(project.status)}{project.lastDeploy ? ` · ${timeAgo(project.lastDeploy.createdAt)}` : ""}</span>
        </div>
        <div className="line faint">
          <span>{source?.source === "github" ? <GithubIcon /> : <ZipIcon size={14} />}</span>
          <span className="ellipsis">{source ? source.label : stackLabel(stackOf(project.config))}{source?.branch ? ` · ${source.branch}` : ""}</span>
          <span style={{ marginLeft: "auto", flexShrink: 0 }}>{timeAgo(project.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { projects, error, reload } = useProjects();
  const usage = useFetch<Usage>("/api/usage", USAGE_REFRESH_MS).data;
  const alerts = useFetch<Alert[]>("/api/alerts", USAGE_REFRESH_MS).data;
  const deploys = useFetch<DeployWithProject[]>(`/api/deployments?limit=${RECENT_DEPLOYS}`, DEPLOYS_REFRESH_MS).data;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.primaryHost.includes(q));
  }, [projects, query]);

  const isSideReady = usage && alerts && deploys;

  return (
    <>
      <div className="overview-toolbar">
        <div className="search">
          <SearchIcon />
          <input className="input" placeholder="Search projects…" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="view-toggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}><GridIcon /></button>
          <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}><ListIcon /></button>
        </div>
        <Link href="/new" className="btn primary">Add New…</Link>
      </div>

      <div className="overview fade-in">
        <aside className="stack">
          {isSideReady ? (
            <>
              <UsageCard usage={usage} />
              <AlertsCard alerts={alerts} />
              <RecentDeployments deploys={deploys} />
            </>
          ) : (
            <SidePanelSkeleton />
          )}
        </aside>

        <section aria-labelledby="projects-heading">
          <h2 className="h3" id="projects-heading" style={{ marginBottom: 16 }}>Projects</h2>
          {error && <p className="notice error">{error}</p>}
          {!projects && !error && <ProjectGridSkeleton />}
          {projects && projects.length === 0 && (
            <div className="empty">
              <h3 className="h3">Deploy your first project</h3>
              <p className="sub">Import a GitHub repository or upload a zip, and pick a subdomain.</p>
              <Link href="/new" className="btn primary">Add New…</Link>
            </div>
          )}
          {projects && projects.length > 0 && visible.length === 0 && <p className="sub">No projects match “{query}”.</p>}
          <div className="cards" style={view === "list" ? { gridTemplateColumns: "1fr" } : undefined}>
            {visible.map((p) => <ProjectCard key={p.id} project={p} onChanged={() => void reload()} />)}
          </div>
        </section>
      </div>
    </>
  );
}
