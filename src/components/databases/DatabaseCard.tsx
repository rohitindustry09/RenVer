"use client";

import Link from "next/link";
import { useState } from "react";
import type { DatabaseListItem, PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { ENGINES, isEngine } from "@/lib/database-engines";
import { isBusyStatus, statusLabel, timeAgo } from "@/lib/format";
import { DataViewer } from "./DataViewer";
import { ConfirmDelete } from "../ConfirmDelete";
import { DatabaseBackups } from "./DatabaseBackups";
import { Select } from "../Select";
import { CopyButton } from "../CopyButton";

interface Props {
  database: DatabaseListItem;
  projects: PublicProject[];
  onChanged: () => void;
}

interface Credentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  connectionUrl: string;
}

function CredentialRow({ label, value, secret, revealed }: { label: string; value: string; secret?: boolean; revealed: boolean }) {
  const shown = secret && !revealed ? "•".repeat(16) : value;
  return (
    <div className="row" style={{ padding: "10px 0" }}>
      <span className="muted" style={{ width: 96, flexShrink: 0 }}>{label}</span>
      <span className="mono row-main" style={{ overflowWrap: "anywhere" }}>{shown}</span>
      <CopyButton text={value} />
    </div>
  );
}

export function DatabaseCard({ database, projects, onChanged }: Props) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isShowingBackups, setIsShowingBackups] = useState(false);
  const [deployedProjectId, setDeployedProjectId] = useState<string | null>(null);
  const [isViewingData, setIsViewingData] = useState(false);
  const [busy, setBusy] = useState<"show" | "link" | "redeploy" | "delete" | "pause" | "resume" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const engineLabel = isEngine(database.engine) ? ENGINES[database.engine].label : database.engine;
  const isRunning = database.status === "running";

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setMessage(null);
    try {
      await task();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  };

  const toggleConnection = () =>
    credentials
      ? setCredentials(null)
      : run("show", async () => {
          setCredentials(await api<Credentials>(`/api/databases/${database.id}/credentials`));
          setIsRevealed(false);
        });

  const link = (redeploy: boolean) =>
    run(redeploy ? "redeploy" : "link", async () => {
      const result = await api<{ variable: string; deployId: string | null; pulled: boolean; note: string | null }>(`/api/databases/${database.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, redeploy }),
      });
      const project = projects.find((p) => p.id === projectId);
      const name = project?.name ?? "the project";
      setMessage({
        kind: "ok",
        text: result.deployId
          ? `Added ${result.variable} to ${name} and started a deploy${result.pulled ? " with the latest code from GitHub" : ""}.${result.note ? ` ${result.note}` : ""}`
          : `Added ${result.variable} to ${name}. Press Pull latest or Redeploy on the project to apply it.`,
      });
      setDeployedProjectId(redeploy ? projectId : null);
      setProjectId("");
      onChanged();
    });

  const setPower = (action: "pause" | "resume") =>
    run(action === "pause" ? "pause" : "resume", async () => {
      await api(`/api/databases/${database.id}/power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setCredentials(null);
      setMessage({ kind: "ok", text: action === "pause" ? "Paused. Resume it when you need it." : "Running again." });
      onChanged();
    });

  const remove = async () => {
    await run("delete", async () => {
      await api(`/api/databases/${database.id}?confirm=${encodeURIComponent(database.name)}`, { method: "DELETE" });
      onChanged();
    });
    setIsDeleting(false);
  };

  return (
    <section className="card" aria-label={`Database ${database.name}`}>
      <div className="row">
        <div className="project-icon" aria-hidden="true">DB</div>
        <div className="row-main">
          <div className="row-title">{database.name}</div>
          <div className="row-desc">
            {engineLabel} {database.version} · created {timeAgo(database.createdAt)}
          </div>
        </div>
        <div className="row-end">
          <span className="status">
            <span className={`dot ${database.status}${isBusyStatus(database.status) ? " pulse" : ""}`} aria-hidden="true" />
            {statusLabel(database.status)}
          </span>
        </div>
      </div>

      {database.status === "failed" && database.error && (
        <p className="notice error" style={{ margin: "0 24px 16px" }}>{database.error}</p>
      )}

      {credentials && (
        <div className="card-pad" style={{ borderTop: "1px solid var(--border)", paddingTop: 8, paddingBottom: 8 }}>
          <CredentialRow label="Host" value={credentials.host} revealed />
          <CredentialRow label="Port" value={String(credentials.port)} revealed />
          <CredentialRow label="Database" value={credentials.database} revealed />
          <CredentialRow label="Username" value={credentials.username} revealed />
          <CredentialRow label="Password" value={credentials.password} secret revealed={isRevealed} />
          <CredentialRow label="URL" value={credentials.connectionUrl} secret revealed={isRevealed} />
          <div className="toolbar" style={{ justifyContent: "space-between", padding: "8px 0" }}>
            <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={isRevealed} onChange={(e) => setIsRevealed(e.target.checked)} /> Show password
            </label>
            <span className="small muted">Reachable from apps deployed here, not from the internet.</span>
          </div>
        </div>
      )}

      {database.links.length > 0 && (
        <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, paddingBottom: 14 }}>
          <span className="small muted">Connected to</span>
          <div className="toolbar">
            {database.links.map((l) => (
              <Link key={`${l.projectId}-${l.variable}`} href={`/projects/${l.projectId}`} className="badge" style={{ gap: 6 }}>
                <span className="dot ok" aria-hidden="true" />
                {l.projectName} <span className="mono muted">{l.variable}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {message && (
        <p className={`notice${message.kind === "error" ? " error" : ""}`} style={{ margin: "0 24px 16px" }} role="status">
          {message.text}
          {deployedProjectId && message.kind === "ok" && (
            <> <Link href={`/projects/${deployedProjectId}`} style={{ textDecoration: "underline" }}>Watch the deploy →</Link></>
          )}
        </p>
      )}

      {isViewingData && <DataViewer databaseId={database.id} databaseName={database.name} onClose={() => setIsViewingData(false)} />}

      {isShowingBackups && <DatabaseBackups databaseId={database.id} databaseName={database.name} isRunning={isRunning} />}

      {isDeleting && (
        <ConfirmDelete
          title="Delete database"
          phrase={database.name}
          message="This permanently deletes the database and all of its data."
          isBusy={busy === "delete"}
          onConfirm={remove}
          onCancel={() => setIsDeleting(false)}
        />
      )}

      <div className="card-foot">
        <div className="toolbar">
          <button type="button" className="btn sm" disabled={!isRunning || busy !== null} onClick={toggleConnection}>
            {busy === "show" ? "Loading…" : credentials ? "Hide connection" : "Show connection"}
          </button>
          <button type="button" className="btn sm" disabled={!isRunning || busy !== null} onClick={() => setIsViewingData(true)}>
            View data
          </button>
          <button type="button" className="btn sm" aria-expanded={isShowingBackups} onClick={() => setIsShowingBackups((v) => !v)}>
            Backups
          </button>
          {isRunning && (
            <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void setPower("pause")}>
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
          {database.status === "paused" && (
            <button type="button" className="btn sm primary" disabled={busy !== null} onClick={() => void setPower("resume")}>
              {busy === "resume" ? "Resuming…" : "Resume"}
            </button>
          )}
          {isRunning && projects.length > 0 && (
            <>
              <Select
                value={projectId}
                onChange={setProjectId}
                ariaLabel="Project to link"
                style={{ width: 200, height: 32 }}
                options={[{ value: "", label: "Link to project…" }, ...projects.map((p) => ({ value: p.id, label: p.name, hint: p.primaryHost }))]}
              />
              <button type="button" className="btn sm" disabled={!projectId || busy !== null} onClick={() => link(false)}>
                {busy === "link" ? "Adding…" : "Add DATABASE_URL"}
              </button>
              <button type="button" className="btn sm primary" disabled={!projectId || busy !== null} onClick={() => link(true)}>
                {busy === "redeploy" ? "Adding…" : "Add & redeploy"}
              </button>
            </>
          )}
        </div>
        <button type="button" className="btn sm danger" disabled={isDeleting} onClick={() => setIsDeleting(true)}>Delete</button>
      </div>
    </section>
  );
}
