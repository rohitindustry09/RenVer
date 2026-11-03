"use client";

import { useState, type FormEvent } from "react";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { validateStoragePaths } from "@/lib/storage";

interface Props {
  project: PublicProject;
  onSaved: () => void;
}

/** Folders inside the app that keep their files when the app is deployed again (databases in files, uploads, caches). */
export function StorageCard({ project, onSaved }: Props) {
  const saved = project.config.storage ?? [];
  const [text, setText] = useState(saved.join("\n"));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checked = validateStoragePaths(text);
  const isChanged = checked.ok && checked.value.join("\n") !== saved.join("\n");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!checked.ok) return;
    setIsBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/projects/${project.id}/storage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: checked.value }),
      });
      setDone(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="storage-heading">
      <div className="card-head"><h2 className="h3" id="storage-heading">Saved folders</h2></div>
      <form className="card-pad stack-sm" onSubmit={submit}>
        <p className="sub">
          Every deploy starts a fresh copy of your app, so files it writes are normally lost. List the folders that should
          keep their files, one per line (for example <span className="mono">/data</span>). They are kept across deploys and
          restarts, and deleted only when you delete the project.
        </p>
        <label className="field">
          <span className="label">Folders inside the app</span>
          <textarea
            className="input mono"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="/data"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
        </label>
        {!checked.ok && <p className="notice error" role="alert">{checked.error}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {done && <p className="notice" role="status">Saved. It takes effect on the next deploy: press Redeploy.</p>}
        <p className="small muted">Saved folders are not part of RenVer backups yet. Keep your own copy of anything you cannot lose.</p>
      </form>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn primary" disabled={isBusy || !isChanged} onClick={(e) => void submit(e as unknown as FormEvent)}>
          {isBusy ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
