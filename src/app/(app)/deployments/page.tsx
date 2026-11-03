"use client";

import Link from "next/link";
import { RowsSkeleton } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import type { DeployWithProject } from "@/lib/db";
import { durationLabel, isBusyStatus, statusLabel, timeAgo } from "@/lib/format";

const REFRESH_MS = 4000;

export default function DeploymentsPage() {
  const { data, error } = useFetch<DeployWithProject[]>("/api/deployments", REFRESH_MS);

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">Deployments</h1>
          <p className="sub">Every build across all of your projects, newest first.</p>
        </div>
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}
      {!data && !error && <RowsSkeleton rows={5} label="Loading deployments" />}
      {data?.length === 0 && (
        <div className="empty">
          <h2 className="h3">No deployments yet</h2>
          <p className="sub">Deploy a project and its builds will show up here.</p>
          <Link href="/new" className="btn primary">Add New…</Link>
        </div>
      )}
      {data && data.length > 0 && (
        <section className="card" aria-label="All deployments">
          <ul className="rows">
            {data.map((deploy) => {
              const duration = durationLabel(deploy.createdAt, deploy.finishedAt);
              return (
                <li key={deploy.id}>
                  <Link
                    href={`/projects/${deploy.projectId}?tab=deployments&deploy=${deploy.id}`}
                    className="row"
                    style={{ borderTop: 0 }}
                  >
                    <span className={`dot ${deploy.status}${isBusyStatus(deploy.status) ? " pulse" : ""}`} aria-hidden="true" />
                    <div className="row-main">
                      <div className="row-title">{deploy.projectName}</div>
                      <div className="row-desc mono">{deploy.primaryHost} · {deploy.id}</div>
                      {deploy.error && <div className="row-desc" style={{ color: "var(--error)" }}>{deploy.error}</div>}
                    </div>
                    <div className="row-end">
                      <span className="muted">{statusLabel(deploy.status)}{duration && ` · ${duration}`}</span>
                      <span className="small muted" style={{ minWidth: 64, textAlign: "right" }}>{timeAgo(deploy.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
