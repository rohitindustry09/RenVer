"use client";

import type { ProjectUpdate } from "@/lib/project-watch";

interface Props {
  update: ProjectUpdate;
  isBusy: boolean;
  onPull: () => void;
}

/** Shown on a project that comes from GitHub when its branch has a commit that is not deployed yet. */
export function ProjectUpdateBanner({ update, isBusy, onPull }: Props) {
  return (
    <div className="notice warn update-banner" role="status">
      <span className="dot warn pulse" style={{ marginTop: 6 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>New commit on GitHub</strong>
        <div className="small muted" style={{ overflowWrap: "anywhere" }}>
          <span className="mono">{update.latest}</span>
          {update.message ? <> · {update.message}</> : null} · deployed now: <span className="mono">{update.deployed}</span>
          {update.branch ? <> · branch <span className="mono">{update.branch}</span></> : null}
        </div>
      </div>
      <button type="button" className="btn sm primary" disabled={isBusy} onClick={onPull}>
        {isBusy ? "Pulling…" : "Pull and deploy"}
      </button>
    </div>
  );
}
