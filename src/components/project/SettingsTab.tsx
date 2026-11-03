"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { rowsToEnv, type EnvRow } from "@/lib/env-text";
import { ConfirmDelete } from "../ConfirmDelete";
import { EnvEditor } from "../new/EnvEditor";
import { AutoDeployCard } from "./AutoDeployCard";
import { EnvVarList } from "./EnvVarList";
import { PauseCard } from "./PauseCard";
import { ProjectDomains } from "./ProjectDomains";
import type { ProjectDetail } from "./types";

interface Props {
  detail: ProjectDetail;
  onRedeploy: () => Promise<void>;
  onChanged: () => void;
}

const EMPTY: EnvRow[] = [{ key: "", value: "" }];

function ConfigValue({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="v mono">{value === null || value === "" ? "—" : value}</span>
    </div>
  );
}

export function SettingsTab({ detail, onRedeploy, onChanged }: Props) {
  const router = useRouter();
  const { project } = detail;
  const [rows, setRows] = useState<EnvRow[]>(EMPTY);
  const [busy, setBusy] = useState<"save" | "redeploy" | "delete" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { data: keysData, reload: reloadKeys } = useFetch<{ keys: string[] }>(`/api/projects/${project.id}/env`);
  const env = rowsToEnv(rows);
  const isDeploying = project.status === "deploying";
  const c = project.config;

  const save = async (andRedeploy: boolean) => {
    setBusy(andRedeploy ? "redeploy" : "save");
    setMessage(null);
    try {
      const added = Object.keys(env.env).length;
      await api(`/api/projects/${project.id}/env`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: env.env }),
      });
      setRows(EMPTY);
      void reloadKeys();
      onChanged();
      if (andRedeploy) await onRedeploy();
      else setMessage({ kind: "ok", text: `Saved ${added} variable${added === 1 ? "" : "s"}. Redeploy to apply them.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      router.push("/");
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Delete failed." });
      setBusy(null);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <div className="stack">
      <ProjectDomains projectId={project.id} primaryHost={project.primaryHost} hosts={detail.hosts} onChanged={onChanged} />

      <section className="card" aria-labelledby="env-heading">
        <div className="card-head">
          <h2 className="h3" id="env-heading">Environment Variables</h2>
          <p className="sub">
            Values are hidden once saved. Adding a name that already exists replaces its value; the other variables are left alone.
          </p>
        </div>
        <div className="card-pad stack">
          <EnvVarList
            projectId={project.id}
            keys={keysData?.keys ?? []}
            disabled={isDeploying}
            onChanged={(text) => {
              setMessage({ kind: "ok", text });
              void reloadKeys();
              onChanged();
            }}
            onError={(text) => setMessage({ kind: "error", text })}
          />
          <span className="label" style={{ fontWeight: 500 }}>Add variables</span>
          <EnvEditor rows={rows} onChange={setRows} />
          {env.error && <p className="notice error" role="alert">{env.error}</p>}
          {message && <p className={`notice${message.kind === "error" ? " error" : ""}`} role="status">{message.text}</p>}
        </div>
        <div className="card-foot">
          <span className="small muted">Changes apply after a redeploy.</span>
          <div className="toolbar">
            <button type="button" className="btn" disabled={busy !== null || env.error !== null || isDeploying} onClick={() => save(false)}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn primary" disabled={busy !== null || env.error !== null || isDeploying} onClick={() => save(true)}>
              {busy === "redeploy" ? "Saving…" : "Save and redeploy"}
            </button>
          </div>
        </div>
      </section>

      <AutoDeployCard projectId={project.id} />

      <section className="card" aria-labelledby="build-heading">
        <div className="card-head"><h2 className="h3" id="build-heading">Build settings</h2></div>
        <div className="card-pad" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <ConfigValue label="Install command" value={c.installCommand} />
          <ConfigValue label="Build command" value={c.buildCommand} />
          <ConfigValue label={c.kind === "static" ? "Output directory" : "Start command"} value={c.kind === "static" ? c.outputDir : c.startCommand} />
          <ConfigValue label="Port" value={c.kind === "static" ? 80 : c.port} />
          <ConfigValue label="Node.js" value={c.nodeVersion} />
        </div>
        <div className="card-foot"><span className="small muted">To change these, import the project again from New Project.</span></div>
      </section>

      <PauseCard project={project} onChanged={onChanged} />

      <section className="card" style={{ borderColor: "var(--error)" }} aria-labelledby="danger-heading">
        <div className="card-head"><h2 className="h3" id="danger-heading">Delete project</h2></div>
        <div className="card-pad"><p className="sub">Stops the app, removes its container and image, and frees the subdomain.</p></div>
        {isConfirmingDelete && (
          <ConfirmDelete
            title="Delete project"
            phrase={project.name}
            message="This stops the app and removes its container, image and subdomain."
            isBusy={busy === "delete"}
            onConfirm={remove}
            onCancel={() => setIsConfirmingDelete(false)}
          />
        )}
        <div className="card-foot" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn danger" disabled={busy !== null || isDeploying || isConfirmingDelete} onClick={() => setIsConfirmingDelete(true)}>
            Delete project
          </button>
        </div>
      </section>
    </div>
  );
}
