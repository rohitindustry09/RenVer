"use client";

import { useState } from "react";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { hostUrl } from "@/lib/domain-names";
import type { PowerAction } from "@/lib/power-actions";
import { POWER_COPY, callPower } from "@/lib/power-copy";
import { ActionMenu, type MenuItem } from "./ActionMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { RestartIcon } from "./shell/icons";

interface Props {
  project: PublicProject;
  /** Called after an action so the list can refresh. */
  onChanged: () => void;
}

/** The "···" menu on a project card: the things you do most often, without opening the project. */
export function ProjectCardMenu({ project, onChanged }: Props) {
  const [asking, setAsking] = useState<PowerAction | null>(null);
  const [busy, setBusy] = useState<PowerAction | "redeploy" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRunning = project.status === "running";
  const isDeploying = project.status === "deploying";
  const hasContainer = project.container !== null;

  const run = async (kind: PowerAction | "redeploy", task: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
      setAsking(null);
    }
  };

  const items: MenuItem[] = [
    { label: "Visit", href: hostUrl(project.primaryHost), isExternal: true, isDisabled: !isRunning },
    { label: "Copy address", onSelect: () => void navigator.clipboard?.writeText(hostUrl(project.primaryHost)).catch(() => undefined) },
    {
      label: "Redeploy",
      isDisabled: isDeploying || busy !== null,
      hasDivider: true,
      onSelect: () => void run("redeploy", () => api(`/api/projects/${project.id}/redeploy`, { method: "POST" })),
    },
    ...(isRunning ? [{ label: "Restart", isDisabled: busy !== null, onSelect: () => setAsking("restart") }] : []),
    isRunning || isDeploying
      ? { label: "Pause project", isDisabled: !isRunning || busy !== null, onSelect: () => setAsking("pause") }
      : { label: "Resume project", isDisabled: !hasContainer || busy !== null, onSelect: () => void run("resume", () => callPower(project.id, "resume")) },
    { label: "Logs and resources", href: `/projects/${project.id}?tab=runtime`, hasDivider: true },
    { label: "Settings", href: `/projects/${project.id}?tab=settings` },
  ];

  return (
    <>
      {asking && (
        <ConfirmDialog
          title={POWER_COPY[asking].title}
          message={POWER_COPY[asking].message}
          confirmLabel={POWER_COPY[asking].button}
          busyLabel={POWER_COPY[asking].busy}
          tone={asking === "pause" ? "danger" : "primary"}
          isBusy={busy === asking}
          onConfirm={() => void run(asking, () => callPower(project.id, asking))}
          onCancel={() => setAsking(null)}
        />
      )}
      {error && (
        <ConfirmDialog title="That did not work" message={error} confirmLabel="OK" onConfirm={() => setError(null)} onCancel={() => setError(null)} />
      )}
      {isRunning && (
        <button
          type="button"
          className="btn sm card-restart"
          title="Restart"
          aria-label={`Restart ${project.name}`}
          disabled={busy !== null}
          onClick={() => setAsking("restart")}
        >
          <RestartIcon />
          {busy === "restart" ? "Restarting…" : "Restart"}
        </button>
      )}
      <ActionMenu items={items} ariaLabel={`Actions for ${project.name}`} />
    </>
  );
}
