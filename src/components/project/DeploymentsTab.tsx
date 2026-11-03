"use client";

import { useState } from "react";
import type { Deploy } from "@/lib/db";
import { durationLabel, isBusyStatus, statusLabel, timeAgo } from "@/lib/format";
import { ConfirmDialog } from "../ConfirmDialog";
import { LogViewer } from "../LogViewer";

interface Props {
  deploys: Deploy[];
  activeId: string | null;
  onToggle: (deployId: string | null) => void;
  /** Rebuilds the project from an earlier deployment's source. */
  onRollback: (deployId: string) => Promise<void>;
  isBusy: boolean;
}

export function DeploymentsTab({ deploys, activeId, onToggle, onRollback, isBusy }: Props) {
  const [rollbackId, setRollbackId] = useState<string | null>(null);

  if (deploys.length === 0) {
    return <div className="empty"><p className="sub">No deployments yet.</p></div>;
  }
  return (
    <section className="card" aria-label="Deployments">
      {rollbackId && (
        <ConfirmDialog
          title="Redeploy this version?"
          message={
            <>
              RenVer rebuilds the project from the source of deployment <span className="mono">{rollbackId}</span> and switches to it
              once it answers. The version running now stays up until then.
            </>
          }
          confirmLabel="Redeploy this version"
          isBusy={isBusy}
          onConfirm={() => void onRollback(rollbackId).finally(() => setRollbackId(null))}
          onCancel={() => setRollbackId(null)}
        />
      )}
      {deploys.map((deploy, index) => {
        const isOpen = activeId === deploy.id;
        const duration = durationLabel(deploy.createdAt, deploy.finishedAt);
        return (
          <div className="deploy-item" key={deploy.id}>
            <button
              type="button"
              className="deploy-head"
              aria-expanded={isOpen}
              onClick={() => onToggle(isOpen ? null : deploy.id)}
            >
              <span className={`dot ${deploy.status}${isBusyStatus(deploy.status) ? " pulse" : ""}`} aria-hidden="true" />
              <span className="mono">{deploy.id}</span>
              <span className="grow muted">
                {statusLabel(deploy.status)}
                {duration && ` · ${duration}`}
                {deploy.error && <span style={{ color: "var(--error)" }}> · {deploy.error}</span>}
              </span>
              {index === 0 && <span className="badge">Latest</span>}
              <span className="small muted">{timeAgo(deploy.createdAt)}</span>
            </button>
            {isOpen && (
              <div className="deploy-body">
                {index > 0 && deploy.status === "live" && deploy.uploadId && (
                  <div className="toolbar" style={{ marginBottom: 12 }}>
                    <button type="button" className="btn sm" disabled={isBusy} onClick={() => setRollbackId(deploy.id)}>
                      Redeploy this version
                    </button>
                    <span className="small muted">Use this to go back if the latest version is broken.</span>
                  </div>
                )}
                <LogViewer deployId={deploy.id} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
