"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { ConfirmDelete } from "../ConfirmDelete";

interface Props {
  projectId: string;
  /** Names only: values are never sent to the browser. */
  keys: string[];
  disabled: boolean;
  /** Called after any change, with a message to show. */
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}

/** The variables already set on a project. Change one value or remove one without touching the others. */
export function EnvVarList({ projectId, keys, disabled, onChanged, onError }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const patch = async (body: { set?: Record<string, string>; remove?: string[] }, done: string) => {
    setIsBusy(true);
    try {
      await api(`/api/projects/${projectId}/env`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChanged(done);
      setEditing(null);
      setValue("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setIsBusy(false);
      setRemoving(null);
    }
  };

  if (keys.length === 0) return <p className="sub">No variables are set yet.</p>;

  return (
    <>
      {removing && (
        <ConfirmDelete
          title="Remove variable"
          phrase={removing}
          message="The app stops getting this value after its next deploy."
          actionLabel="Remove variable"
          busyLabel="Removing…"
          isBusy={isBusy}
          onConfirm={() => void patch({ remove: [removing] }, `Removed ${removing}. Redeploy to apply it.`)}
          onCancel={() => setRemoving(null)}
        />
      )}
      <ul className="rows" aria-label="Variables that are set">
        {keys.map((key) => (
          <li className="row" key={key} style={{ padding: "10px 0" }}>
            <div className="row-main">
              <div className="row-title mono">{key}</div>
              {editing === key ? (
                <form
                  className="toolbar"
                  style={{ marginTop: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (value) void patch({ set: { [key]: value } }, `Updated ${key}. Redeploy to apply it.`);
                  }}
                >
                  <input
                    className="input mono grow"
                    type="password"
                    autoFocus
                    autoComplete="new-password"
                    placeholder="New value"
                    aria-label={`New value for ${key}`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <button type="submit" className="btn sm primary" disabled={!value || isBusy}>{isBusy ? "Saving…" : "Update"}</button>
                  <button type="button" className="btn sm" onClick={() => { setEditing(null); setValue(""); }}>Cancel</button>
                </form>
              ) : (
                <div className="row-desc mono">{"•".repeat(12)}</div>
              )}
            </div>
            {editing !== key && (
              <div className="row-end">
                <button type="button" className="btn sm" disabled={disabled || isBusy} onClick={() => { setEditing(key); setValue(""); }}>Change</button>
                <button type="button" className="btn sm danger" disabled={disabled || isBusy} onClick={() => setRemoving(key)}>Remove</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
