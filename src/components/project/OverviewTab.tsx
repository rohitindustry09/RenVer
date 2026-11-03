"use client";

import { FrameworkIcon } from "@/components/FrameworkIcon";
import { useFetch } from "@/hooks/useFetch";
import { LivePreview } from "./LivePreview";
import { stackLabel, stackOf } from "@/lib/stack";
import { hostUrl } from "@/lib/domain-names";
import { durationLabel, isBusyStatus, statusLabel, timeAgo } from "@/lib/format";
import type { ProjectDetail } from "./types";

interface Props {
  detail: ProjectDetail;
  url: string;
  host: string;
  onOpenDeploy: (deployId: string) => void;
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

export function OverviewTab({ detail, url, host, onOpenDeploy }: Props) {
  const { project, deploys } = detail;
  const latest = deploys[0];
  const isLive = project.status === "running";
  const canPreview = useFetch<{ canPreview: boolean }>(isLive ? `/api/projects/${project.id}/preview` : null).data?.canPreview ?? false;

  return (
    <div className="stack">
      <section className="card" aria-labelledby="prod-heading">
        <div className="card-head"><h2 className="h3" id="prod-heading">Production Deployment</h2></div>
        <div className="prod-grid">
          {isLive && canPreview ? (
            <LivePreview url={url} host={host} />
          ) : (
            <div className="preview">
              <span className={`dot ${project.status}${isBusyStatus(project.status) ? " pulse" : ""}`} aria-hidden="true" />
              <span className="mono">{host}</span>
              <span className="small muted">{isLive ? "Serving traffic" : statusLabel(project.status)}</span>
            </div>
          )}
          <div className="kv-list">
            <Kv label={detail.hosts.length > 1 ? "Domains" : "Domain"}>
              <span style={{ display: "grid", gap: 2 }}>
                {detail.hosts.map((h) =>
                  isLive ? (
                    <a key={h} className="mono" href={hostUrl(h)} target="_blank" rel="noopener noreferrer">{h}</a>
                  ) : (
                    <span key={h} className="mono">{h}</span>
                  ),
                )}
              </span>
            </Kv>
            <Kv label="Status">
              <span className="status"><span className={`dot ${project.status}`} aria-hidden="true" />{statusLabel(project.status)}</span>
            </Kv>
            <Kv label="Created">{timeAgo(project.createdAt)}</Kv>
            <Kv label="Framework">
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <FrameworkIcon stack={stackOf(project.config)} size={16} />
                {stackLabel(stackOf(project.config))} · {project.config.kind === "static" ? "static site" : "server app"}
              </span>
            </Kv>
            {detail.directUrl && isLive && (
              <Kv label="Server address">
                <a className="mono" href={detail.directUrl} target="_blank" rel="noopener noreferrer">{detail.directUrl.replace("http://", "")}</a>
              </Kv>
            )}
            {project.hostPort && <Kv label="Local port"><span className="mono">127.0.0.1:{project.hostPort}</span></Kv>}
          </div>
        </div>
      </section>

      {latest && (
        <section className="card" aria-labelledby="latest-heading">
          <div className="card-head"><h2 className="h3" id="latest-heading">Latest deployment</h2></div>
          <div className="row">
            <span className={`dot ${latest.status}${isBusyStatus(latest.status) ? " pulse" : ""}`} aria-hidden="true" />
            <div className="row-main">
              <div className="row-title mono">{latest.id}</div>
              <div className="row-desc">
                {statusLabel(latest.status)} · {timeAgo(latest.createdAt)}
                {durationLabel(latest.createdAt, latest.finishedAt) && ` · ${durationLabel(latest.createdAt, latest.finishedAt)}`}
                {latest.error && ` · ${latest.error}`}
              </div>
            </div>
            <div className="row-end">
              <button type="button" className="btn sm" onClick={() => onOpenDeploy(latest.id)}>View build log</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
