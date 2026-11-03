"use client";

import { Fragment, useRef, useState } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { ConfirmDialog } from "./ConfirmDialog";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { validateBackupTime } from "@/lib/backup-schedule";
import { formatDateTime, timeAgo } from "@/lib/format";
import { CopyButton } from "./CopyButton";

interface Schedule {
  enabled: boolean;
  /** HH:MM in the server's time zone. */
  time: string;
  keep: number;
  timezone: string;
  utcOffset: string;
  lastAutoAt: string | null;
  next: { at: string; isDue: boolean } | null;
}

const browserOffset = (): string => {
  const minutes = -new Date().getTimezoneOffset();
  const abs = Math.abs(minutes);
  return `UTC${minutes >= 0 ? "+" : "-"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

/** When automatic backups run, when the last one ran, and when the next one will. */
function ScheduleBlock({ schedule, onSaved }: { schedule: Schedule; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [time, setTime] = useState(schedule.time);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const check = validateBackupTime(time);
  const isChanged = enabled !== schedule.enabled || (check.ok && check.value !== schedule.time);
  const showsYourTime = browserOffset() !== schedule.utcOffset;

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      await api("/api/backups/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, time }),
      });
      setMessage({ ok: true, text: "Schedule saved." });
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save the schedule." });
    } finally {
      setIsSaving(false);
    }
  };

  const nextText = !schedule.enabled
    ? "Off. No automatic backups will be made."
    : schedule.next?.isDue
      ? "Due now. It will run within 30 seconds."
      : schedule.next
        ? formatDateTime(schedule.next.at)
        : "";

  return (
    <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="row-title">Automatic daily backup</div>
          <div className="row-desc">Keeps the newest {schedule.keep}; older ones are deleted. Manual and full backups are never deleted.</div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {enabled ? "On" : "Off"}
        </label>
      </div>

      <div className="toolbar">
        <span>Every day at</span>
        <input
          className="input mono"
          style={{ width: 130 }}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time of day for the automatic backup"
          disabled={!enabled}
        />
        <span className="small muted">server time ({schedule.utcOffset}, {schedule.timezone})</span>
        <button type="button" className="btn sm" disabled={isSaving || !isChanged || !check.ok} onClick={save}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
      {!check.ok && <p className="small" style={{ color: "var(--error)" }}>{check.error}</p>}

      <dl className="stack-sm" style={{ margin: 0, gap: 4 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <dt className="muted" style={{ minWidth: 150 }}>Last automatic backup</dt>
          <dd style={{ margin: 0 }}>
            {schedule.lastAutoAt ? <>{formatDateTime(schedule.lastAutoAt)} <span className="muted">({timeAgo(schedule.lastAutoAt)})</span></> : "None yet"}
          </dd>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <dt className="muted" style={{ minWidth: 150 }}>Next automatic backup</dt>
          <dd style={{ margin: 0 }}>{nextText}</dd>
        </div>
      </dl>
      <p className="small muted">
        {showsYourTime && "Dates are shown in your time zone. "}
        It only runs while RenVer is running. If RenVer was off at the scheduled time, the backup is made as soon as it starts again.
      </p>
      {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
    </div>
  );
}

interface BackupItem {
  name: string;
  bytes: number;
  encrypted: boolean;
  kind: "auto" | "manual" | "full";
  createdAt: string;
  file: string;
}

interface RestoreSummary {
  restored: string[];
  safetyBackup: string;
  projects: number;
  /** What was paused once the data was back. */
  paused: { projects: number; databases: number } | null;
}

interface CreatedBackup extends BackupItem {
  databases: string[];
  skipped: { name: string; reason: string }[];
}

const KIND_LABEL: Record<BackupItem["kind"], string> = {
  auto: "Automatic",
  manual: "Manual",
  full: "Full (with sources)",
};

const KIB = 1024;
const MIB = KIB * 1024;
const RELOAD_DELAY_MS = 2500;
const SCHEDULE_REFRESH_MS = 30_000;

function sizeLabel(bytes: number): string {
  return bytes >= MIB ? `${(bytes / MIB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / KIB))} KB`;
}

type Busy = "manual" | "full" | "upload" | `delete:${string}` | `restore:${string}` | null;

export function BackupsCard() {
  const { data, error, reload } = useFetch<BackupItem[]>("/api/backups", SCHEDULE_REFRESH_MS);
  const { data: schedule, reload: reloadSchedule } = useFetch<Schedule>("/api/backups/schedule", SCHEDULE_REFRESH_MS);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const { data: security } = useFetch<{ isEncrypting: boolean }>("/api/backups/security");
  const [passphrase, setPassphrase] = useState("");

  /** Backups made on another server can be encrypted with a passphrase this one does not have set. */
  const needsPassphrase = (backup: BackupItem): boolean => backup.encrypted && !security?.isEncrypting;
  const passphraseField = (
    <label className="field">
      <span className="label">Backup passphrase</span>
      <input
        className="input"
        type="password"
        autoComplete="off"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="The passphrase this backup was encrypted with"
      />
    </label>
  );
  const fileInput = useRef<HTMLInputElement>(null);

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

  const create = (full: boolean) =>
    run(full ? "full" : "manual", async () => {
      const info = await api<CreatedBackup>("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const withData = info.databases.length > 0 ? ` Includes the data of ${info.databases.join(", ")}.` : "";
      const left = info.skipped.length > 0 ? ` Not included (could not be read): ${info.skipped.map((s) => s.name).join(", ")}.` : "";
      return `Created ${info.name} (${sizeLabel(info.bytes)}).${withData}${left}`;
    });

  const remove = async (backup: BackupItem) => {
    await run(`delete:${backup.name}`, async () => {
      await api(`/api/backups/${backup.name}`, { method: "DELETE" });
      return "Backup deleted.";
    });
    setDeletingName(null);
  };

  const restore = async (backup: BackupItem) => {
    await run(`restore:${backup.name}`, async () => {
      const summary = await api<RestoreSummary>("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: backup.name, passphrase: needsPassphrase(backup) ? passphrase : undefined }),
      });
      setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
      const paused = summary.paused ? ` ${summary.paused.projects} project(s) and ${summary.paused.databases} database(s) are paused: resume each one when you want it running.` : "";
      return `Restored ${summary.projects} project${summary.projects === 1 ? "" : "s"}.${paused} Your previous state was saved as ${summary.safetyBackup}. Reloading…`;
    });
    setRestoringName(null);
  };

  const upload = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    void run("upload", async () => {
      const info = await api<BackupItem>("/api/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/gzip", ...(passphrase ? { "x-backup-passphrase": passphrase } : {}) },
        body: file,
      });
      return `Uploaded as ${info.name}. Press Restore on it to use it.`;
    });
  };

  const latest = data?.[0];
  const restoreCommand = latest ? `npm run restore -- "${latest.file}"` : 'npm run restore -- "<backup file>"';

  return (
    <section className="card" aria-labelledby="backups-heading">
      <div className="card-head">
        <h2 className="h3" id="backups-heading">Backups</h2>
        <p className="sub">
          A copy of everything: your projects, domains, settings and the data inside your databases, plus the key that unlocks stored
          passwords. Set when the daily automatic backup runs below.
        </p>
        {security && !security.isEncrypting && (
          <p className="notice warn" role="status" style={{ marginTop: 12 }}>
            New backups are <strong>not encrypted</strong>, and each one contains your encryption key. Set{" "}
            <span className="mono">RENVER_BACKUP_PASSPHRASE</span> on the server and restart RenVer so anyone who gets a backup file cannot read it.
          </p>
        )}
      </div>

      {schedule && <ScheduleBlock key={`${schedule.enabled}-${schedule.time}`} schedule={schedule} onSaved={() => void reloadSchedule()} />}

      {error && <p className="notice error" style={{ margin: 16 }}>{error}</p>}
      {data?.length === 0 && <div className="card-pad"><p className="sub">No backups yet. The first automatic one appears shortly after RenVer starts. You can also upload one.</p></div>}
      {data && data.length > 0 && (
        <ul className="rows">
          {data.map((backup) => (
            <Fragment key={backup.name}>
              <li className="row">
                <div className="row-main">
                  <div className="row-title">
                    {KIND_LABEL[backup.kind]}{backup.encrypted && <> <span className="badge">Encrypted</span></>}
                  </div>
                  <div className="row-desc">
                    <strong style={{ fontWeight: 500, color: "var(--text)" }}>{formatDateTime(backup.createdAt)}</strong>
                    {" · "}{timeAgo(backup.createdAt)}{" · "}{sizeLabel(backup.bytes)}
                  </div>
                  <div className="row-desc mono small">{backup.name}</div>
                </div>
                <div className="row-end">
                  <button type="button" className="btn sm" disabled={busy !== null} onClick={() => setRestoringName(backup.name)}>
                    {busy === `restore:${backup.name}` ? "Restoring…" : "Restore"}
                  </button>
                  <a className="btn sm" href={`/api/backups/${backup.name}`} download>Download</a>
                  <button type="button" className="btn sm danger" disabled={busy !== null || deletingName === backup.name} onClick={() => setDeletingName(backup.name)}>
                    Delete
                  </button>
                </div>
              </li>
              {restoringName === backup.name && (
                <ConfirmDialog
                  title="Restore this backup?"
                  message={
                    <>
                      This replaces your current projects, domains, settings and database data with the ones in <span className="mono">{backup.name}</span>.
                      Everything comes back <strong>paused</strong>: apps and databases are stopped, and you resume each one when you want it running.
                      A backup of the current state is saved first, so you can undo it.
                    </>
                  }
                  extra={needsPassphrase(backup) ? passphraseField : undefined}
                  confirmLabel="Restore"
                  busyLabel="Restoring…"
                  isBusy={busy === `restore:${backup.name}`}
                  onConfirm={() => void restore(backup)}
                  onCancel={() => setRestoringName(null)}
                />
              )}
              {deletingName === backup.name && (
                <ConfirmDelete
                  title="Delete backup"
                  phrase="delete"
                  message={`${backup.name} is removed for good, so you could not restore from it.`}
                  isBusy={busy === `delete:${backup.name}`}
                  onConfirm={() => void remove(backup)}
                  onCancel={() => setDeletingName(null)}
                />
              )}
            </Fragment>
          ))}
        </ul>
      )}

      {message && (
        <p className={`notice${message.ok ? "" : " error"}`} style={{ margin: "16px 24px 0" }} role="status">{message.text}</p>
      )}

      <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)", marginTop: 16 }}>
        <span className="label" style={{ fontWeight: 500 }}>Restoring on a new server, or when RenVer won&apos;t start</span>
        <p className="sub">
          Upload the backup file here and press Restore. If RenVer can&apos;t start, stop it and run this in its folder instead; the
          database it replaces is kept beside it so you can undo. For an encrypted backup add its passphrase in front of the command:
          <span className="mono"> RENVER_BACKUP_PASSPHRASE=… </span>
        </p>
        {security && !security.isEncrypting && (
          <label className="field">
            <span className="label">Passphrase for an encrypted backup you are uploading</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Only needed if the backup is encrypted and this server has no passphrase set"
            />
          </label>
        )}
        <div className="toolbar">
          <code className="mono grow" style={{ overflowWrap: "anywhere", fontSize: 12 }}>{restoreCommand}</code>
          <CopyButton text={restoreCommand} label="Copy" />
        </div>
        <p className="small muted">
          Every backup holds RenVer&apos;s settings and the data inside your running databases. A full backup also holds each
          project&apos;s source, which is what lets apps be rebuilt on a new machine (Docker images themselves are not stored). After a
          restore everything is paused until you resume it. Keep downloaded backups somewhere safe: they contain the encryption key.
        </p>
      </div>

      <div className="card-foot">
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          accept=".gz,.tgz,.enc,application/gzip,application/x-gzip,application/octet-stream"
          aria-label="Choose a backup file to upload"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <button type="button" className="btn sm" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy === "upload" ? "Uploading…" : "Upload backup"}
        </button>
        <div className="toolbar">
          <button type="button" className="btn sm" disabled={busy !== null} onClick={() => create(true)}>
            {busy === "full" ? "Backing up…" : "Full backup"}
          </button>
          <button type="button" className="btn primary sm" disabled={busy !== null} onClick={() => create(false)}>
            {busy === "manual" ? "Backing up…" : "Back up now"}
          </button>
        </div>
      </div>
    </section>
  );
}
