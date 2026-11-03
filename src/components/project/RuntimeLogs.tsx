"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { LogPanel } from "../LogPanel";
import { Skeleton } from "../Skeleton";

const LIVE_REFRESH_MS = 3000;
const LINES = 300;

/** What the running app is printing. It refreshes every few seconds while "Live" is on. */
export function RuntimeLogs({ projectId, canRead }: { projectId: string; canRead: boolean }) {
  const [isLive, setIsLive] = useState(true);
  const { data, error } = useFetch<{ lines: string[] }>(canRead ? `/api/projects/${projectId}/logs?lines=${LINES}` : null, isLive ? LIVE_REFRESH_MS : undefined);

  return (
    <section className="card" aria-labelledby="runtime-logs-heading">
      <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="h3" id="runtime-logs-heading">Logs</h2>
        <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={isLive} onChange={(e) => setIsLive(e.target.checked)} /> Live
        </label>
      </div>
      <div className="card-pad">
        {!canRead && <p className="sub">The app has not been started yet, so there is nothing to show.</p>}
        {canRead && error && !data && <p className="notice error">{error}</p>}
        {canRead && !data && !error && <Skeleton height={180} />}
        {canRead && data && (
          <LogPanel text={data.lines.join("\n")} ariaLabel="App logs" emptyText="The app has not printed anything yet." />
        )}
      </div>
    </section>
  );
}
