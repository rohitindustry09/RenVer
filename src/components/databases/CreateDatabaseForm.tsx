"use client";

import { useState, type FormEvent } from "react";
import { ENGINES, validateDatabaseName, type Engine } from "@/lib/database-engines";
import { api } from "@/lib/client-api";
import { Select } from "../Select";

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

const ENGINE_IDS = Object.keys(ENGINES) as Engine[];

export function CreateDatabaseForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<Engine>("postgres");
  const [version, setVersion] = useState<string>(ENGINES.postgres.versions[0]!);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const nameCheck = name ? validateDatabaseName(name) : null;

  const chooseEngine = (next: Engine) => {
    setEngine(next);
    setVersion(ENGINES[next].versions[0]!);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await api("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, engine, version }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the database.");
      setIsBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-head">
        <h2 className="h3">Create a database</h2>
        <p className="sub">Runs in its own container with a generated username and password.</p>
      </div>
      <div className="card-pad stack">
        <label className="field">
          <span className="label">Name</span>
          <input
            className="input mono"
            value={name}
            placeholder="my-store"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          {nameCheck && !nameCheck.ok && <span className="hint" style={{ color: "var(--error)" }}>{nameCheck.error}</span>}
        </label>
        <div className="row" style={{ border: 0, padding: 0, alignItems: "flex-start" }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Engine</span>
            <Select
              value={engine}
              ariaLabel="Engine"
              onChange={(v) => chooseEngine(v as Engine)}
              options={ENGINE_IDS.map((id) => ({ value: id, label: ENGINES[id].label }))}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="label">Version</span>
            <Select
              value={version}
              ariaLabel="Version"
              onChange={setVersion}
              options={ENGINES[engine].versions.map((v) => ({ value: v, label: v }))}
            />
          </label>
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="card-foot">
        <span className="small muted">The first start downloads the image, which can take a minute.</span>
        <div className="toolbar">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={isBusy || !nameCheck?.ok}>
            {isBusy ? "Creating…" : "Create database"}
          </button>
        </div>
      </div>
    </form>
  );
}
