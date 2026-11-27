"use client";

import { useState } from "react";
import { usePanelLog } from "@/hooks/usePanelLog";
import { useUpdate } from "@/hooks/useUpdate";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogPanel } from "./LogPanel";

type LogTab = "update" | "panel";

const STATUS: Record<string, { dot: string; title: string }> = {
  idle: { dot: "", title: "Ready" },
  running: { dot: "warn pulse", title: "Updating" },
  restarting: { dot: "warn pulse", title: "Restarting" },
  done: { dot: "ok", title: "Finished" },
  failed: { dot: "fail", title: "Failed" },
};

const STEP_LABEL: Record<string, string> = { pull: "Pulling the latest code", install: "Installing packages", build: "Building" };

/** Update RenVer from GitHub: pull, build in a spare folder, restart. Shows the build log and the panel's own log live. */
export function UpdateCard() {
  const update = useUpdate();
  const [tab, setTab] = useState<LogTab>("update");
  const [pending, setPending] = useState<"normal" | "force" | null>(null);
  const panelLog = usePanelLog(tab === "panel");

  const { state } = update;
  const status = update.isDown ? STATUS.restarting! : (STATUS[state.status] ?? STATUS.idle!);
  const detail = update.isDown
    ? "The panel is restarting. This page reloads by itself when it is back."
    : state.status === "running"
      ? `${STEP_LABEL[state.step ?? ""] ?? "Starting"}…`
      : state.message || "Pull the latest version from GitHub, build it and restart. Your apps keep running.";

  const confirm = () => {
    const force = pending === "force";
    setPending(null);
    setTab("update");
    void update.start(force);
  };

  return (
    <section className="card" aria-labelledby="update-heading">
      {pending && (
        <ConfirmDialog
          title="Update RenVer?"
          message={
            <>
              This pulls the latest code from GitHub, builds it and {update.supervised ? "restarts the panel" : "leaves it for you to restart"}. The
              build runs in a spare folder, so the panel keeps working until it is ready. If the new build cannot start, RenVer goes back to the
              previous one by itself.
            </>
          }
          confirmLabel={pending === "force" ? "Rebuild" : "Update"}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      <div className="card-head">
        <h2 className="h3" id="update-heading">Update RenVer</h2>
        <p className="sub">
          {update.version ? <>Running <span className="mono">{update.version.commit}</span> · {update.version.subject}</> : "Pull, build and restart from here."}
        </p>
      </div>

      <div className="card-pad stack-sm">
        <div className="status-line">
          <span className={`dot ${status.dot}`} aria-hidden="true" />
          <div>
            <div className="row-title">{status.title}</div>
            <div className="row-desc">{detail}</div>
          </div>
        </div>
        {!update.supervised && (
          <p className="notice warn" role="status">
            RenVer was not started through <span className="mono">npm start</span>, so it can build the new version but cannot restart itself. Restart
            it yourself after the build.
          </p>
        )}
        {update.error && <p className="notice error" role="alert">{update.error}</p>}

        <div className="seg" role="group" aria-label="Log">
          <button type="button" aria-pressed={tab === "update"} onClick={() => setTab("update")}>Update log</button>
          <button type="button" aria-pressed={tab === "panel"} onClick={() => setTab("panel")}>Panel log</button>
        </div>
        {tab === "update" ? (
          <LogPanel text={update.log} ariaLabel="Update log" emptyText="Nothing yet. Press Pull, build and restart to see the build here." />
        ) : (
          <LogPanel text={panelLog} ariaLabel="Panel log" emptyText="The panel has not written anything yet." />
        )}
      </div>

      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" disabled={update.isBusy || update.isDown} onClick={() => setPending("force")}>
          Rebuild anyway
        </button>
        <button type="button" className="btn primary" disabled={update.isBusy || update.isDown} onClick={() => setPending("normal")}>
          {update.isBusy ? "Working…" : "Pull, build and restart"}
        </button>
      </div>
    </section>
  );
}
