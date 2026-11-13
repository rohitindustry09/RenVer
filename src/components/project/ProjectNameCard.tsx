"use client";

import { useState, type FormEvent } from "react";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { validateProjectName } from "@/lib/project-name";

interface Props {
  project: PublicProject;
  onSaved: () => void;
}

/** Changes the name shown for the project. Its address, containers and data are not touched. */
export function ProjectNameCard({ project, onSaved }: Props) {
  const [name, setName] = useState(project.name);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const checked = validateProjectName(name);
  const isChanged = checked.ok && checked.value !== project.name;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!checked.ok || !isChanged) return;
    setIsBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: checked.value }),
      });
      setDone(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the project.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="project-name-heading">
      <div className="card-head"><h2 className="h3" id="project-name-heading">Project name</h2></div>
      <form className="card-pad stack-sm" onSubmit={save}>
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDone(false); }} maxLength={120} autoComplete="off" />
        </label>
        {!checked.ok && name !== "" && <p className="notice error" role="alert">{checked.error}</p>}
        {!checked.ok && name === "" && <p className="small muted">The name cannot be empty.</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {done && <p className="notice" role="status">Renamed. Its address, running app and data are unchanged.</p>}
        <p className="small muted">This is only the name shown in RenVer. To change the web address, use Domains below.</p>
      </form>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn primary" disabled={isBusy || !isChanged} onClick={(e) => void save(e as unknown as FormEvent)}>
          {isBusy ? "Saving…" : "Save name"}
        </button>
      </div>
    </section>
  );
}
