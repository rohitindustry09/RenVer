"use client";

import { useState } from "react";
import type { PublicProject } from "@/lib/api";
import type { PowerAction } from "@/lib/power-actions";
import { POWER_COPY, callPower } from "@/lib/power-copy";
import { ConfirmDialog } from "../ConfirmDialog";

interface Props {
  project: PublicProject;
  onChanged: () => void;
}

/** Pause the whole project (nothing runs, nothing is deleted) or bring it back. */
export function PauseCard({ project, onChanged }: Props) {
  const [isAsking, setIsAsking] = useState(false);
  const [busy, setBusy] = useState<PowerAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaused = project.status === "paused";
  const canAct = project.container !== null && project.status !== "deploying";
  const action: PowerAction = isPaused ? "resume" : "pause";

  const apply = async () => {
    setBusy(action);
    setError(null);
    try {
      await callPower(project.id, action);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
      setIsAsking(false);
    }
  };

  return (
    <section className="card" aria-labelledby="pause-heading">
      {isAsking && (
        <ConfirmDialog
          title={POWER_COPY.pause.title}
          message={POWER_COPY.pause.message}
          confirmLabel={POWER_COPY.pause.button}
          busyLabel={POWER_COPY.pause.busy}
          tone="danger"
          isBusy={busy === "pause"}
          onConfirm={() => void apply()}
          onCancel={() => setIsAsking(false)}
        />
      )}
      <div className="card-head"><h2 className="h3" id="pause-heading">{isPaused ? "This project is paused" : "Pause project"}</h2></div>
      <div className="card-pad stack-sm">
        <p className="sub">
          {isPaused
            ? "It is not running and its addresses are offline. Resume it to bring it back exactly as it was."
            : "Stops the app completely so it uses no memory or CPU, and takes its addresses offline. Nothing is deleted, and you can resume it any time."}
        </p>
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className={`btn${isPaused ? " primary" : ""}`}
          disabled={!canAct || busy !== null}
          onClick={() => (isPaused ? void apply() : setIsAsking(true))}
        >
          {busy === action ? POWER_COPY[action].busy : POWER_COPY[action].button}
        </button>
      </div>
    </section>
  );
}
