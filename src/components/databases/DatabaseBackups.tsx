"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import type { DumpInfo } from "@/lib/db-dumps";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { ConfirmDelete } from "../ConfirmDelete";
import { ConfirmDialog } from "../ConfirmDialog";

interface Props {
  databaseId: string;
  databaseName: string;
  isRunning: boolean;
}

interface DumpList {
  dumps: (Omit<DumpInfo, "createdAt"> & { createdAt: string })[];
  keepAuto: number;
}

type Busy = "create" | `restore:${string}` | `delete:${string}` | null;

/** Saved copies of what is inside one database: make one now, download it, restore it, delete it. */
export function DatabaseBackups({ databaseId, databaseName, isRunning }: Props) {
  const { data, error, reload } = useFetch<DumpList>(`/api/databases/${databaseId}/dumps`);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const run = async (kind: Exclude<Busy, null>, task: () => Promise<string>) => {
    setBusy(kind);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  };

  const base = `/api/databases/${databaseId}/dumps`;
  const create = () =>
    run("create", async () => {
      const dump = await api<{ name: string; bytes: number }>(base, { method: "POST" });
      return `Saved ${dump.name} (${formatBytes(dump.bytes)}).`;
    });
  const restore = async (name: string) => {
    await run(`restore:${name}`, async () => {
      const result = await api<{ safetyDump: string }>(`${base}/${name}`, { method: "POST" });
      return `Restored. What was there before is saved as ${result.safetyDump}.`;
    });
    setRestoring(null);
  };
  const remove = async (name: string) => {
    await run(`delete:${name}`, async () => {
      await api(`${base}/${name}`, { method: "DELETE" });
      return "Backup deleted.";
    });
    setDeleting(null);
  };

  return (
    <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)" }}>
      {restoring && (
        <ConfirmDialog
          title="Restore this backup?"
          message={
            <>
              The data in <span className="mono">{databaseName}</span> is replaced with the contents of <span className="mono">{restoring}</span>.
              What is there now is saved first, so you can undo this.
            </>
          }
          confirmLabel="Restore"
          busyLabel="Restoring…"
          isBusy={busy === `restore:${restoring}`}
          onConfirm={() => void restore(restoring)}
          onCancel={() => setRestoring(null)}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title="Delete backup"
          phrase="delete"
          message={`${deleting} is removed for good.`}
          isBusy={busy === `delete:${deleting}`}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <span className="small muted">
          Saved copies of the data inside this database. A new one is made with each daily backup (the newest {data?.keepAuto ?? 7} are kept).
        </span>
        <button type="button" className="btn sm" disabled={!isRunning || busy !== null} onClick={() => void create()}>
          {busy === "create" ? "Saving…" : "Back up now"}
        </button>
      </div>

      {error && <p className="notice error">{error}</p>}
      {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
      {data?.dumps.length === 0 && <p className="sub">No backups of this database yet.</p>}
      {data && data.dumps.length > 0 && (
        <ul className="rows">
          {data.dumps.map((d) => (
            <li className="row" key={d.name} style={{ padding: "10px 0" }}>
              <div className="row-main">
                <div className="row-title">
                  {formatDateTime(d.createdAt)} <span className="badge">{d.kind === "auto" ? "Automatic" : "Manual"}</span>
                </div>
                <div className="row-desc">{timeAgo(d.createdAt)} · {formatBytes(d.bytes)}</div>
              </div>
              <div className="row-end">
                <button type="button" className="btn sm" disabled={!isRunning || busy !== null} onClick={() => setRestoring(d.name)}>Restore</button>
                <a className="btn sm" href={`${base}/${d.name}`} download>Download</a>
                <button type="button" className="btn sm danger" disabled={busy !== null} onClick={() => setDeleting(d.name)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
