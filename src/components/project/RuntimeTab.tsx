"use client";

import { useState } from "react";
import type { PublicProject } from "@/lib/api";
import { statusLabel } from "@/lib/format";
import type { PowerAction } from "@/lib/power-actions";
import { POWER_COPY, callPower, powerDoneText } from "@/lib/power-copy";
import { ConfirmDialog } from "../ConfirmDialog";
import { RuntimeLogs } from "./RuntimeLogs";
import { RuntimeResources } from "./RuntimeResources";
import { DnsCard } from "./DnsCard";
import { StorageCard } from "./StorageCard";

interface Props {
  project: PublicProject;
  onChanged: () => void;
}

/** Pause, resume and restart, live resource use and limits, and the app's own logs. */
export function RuntimeTab({ project, onChanged }: Props) {
  const [pending, setPending] = useState<PowerAction | null>(null);
  const [busy, setBusy] = useState<PowerAction | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const isDeploying = project.status === "deploying";
  const isRunning = project.status === "running";
  const hasContainer = project.container !== null;

  const apply = async (action: PowerAction) => {
    setBusy(action);
    setMessage(null);
    try {
      const result = await callPower(project.id, action);
      setMessage({ ok: true, text: powerDoneText(action, result) });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const ask = (action: PowerAction) => (action === "resume" ? void apply(action) : setPending(action));

  return (
    <div className="stack">
      {pending && (
        <ConfirmDialog
          title={POWER_COPY[pending].title}
          message={POWER_COPY[pending].message}
          confirmLabel={POWER_COPY[pending].button}
          busyLabel={POWER_COPY[pending].busy}
          tone={pending === "pause" ? "danger" : "primary"}
          isBusy={busy === pending}
          onConfirm={() => void apply(pending)}
          onCancel={() => setPending(null)}
        />
      )}

      <section className="card" aria-labelledby="power-heading">
        <div className="card-head"><h2 className="h3" id="power-heading">Status</h2></div>
        <div className="card-pad toolbar" style={{ justifyContent: "space-between" }}>
          <span className="status">
            <span className={`dot ${project.status}`} aria-hidden="true" />
            {statusLabel(project.status)}
          </span>
          <div className="toolbar">
            {isRunning && (
              <>
                <button type="button" className="btn sm" disabled={busy !== null} onClick={() => ask("restart")}>{busy === "restart" ? POWER_COPY.restart.busy : "Restart"}</button>
                <button type="button" className="btn sm" disabled={busy !== null} onClick={() => ask("pause")}>{busy === "pause" ? POWER_COPY.pause.busy : "Pause"}</button>
              </>
            )}
            {!isRunning && (
              <button type="button" className="btn sm primary" disabled={busy !== null || isDeploying || !hasContainer} onClick={() => ask("resume")}>
                {busy === "resume" ? POWER_COPY.resume.busy : "Resume"}
              </button>
            )}
          </div>
        </div>
        {message && <p className={`notice${message.ok ? "" : " error"}`} style={{ margin: "0 24px 16px" }} role="status">{message.text}</p>}
      </section>

      <RuntimeResources key={JSON.stringify(project.config.limits ?? {})} project={project} onSaved={onChanged} />

      <StorageCard key={JSON.stringify(project.config.storage ?? [])} project={project} onSaved={onChanged} />

      <DnsCard key={JSON.stringify(project.config.dns ?? [])} project={project} onSaved={onChanged} />
      <RuntimeLogs projectId={project.id} canRead={hasContainer} />
    </div>
  );
}
