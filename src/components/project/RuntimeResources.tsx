"use client";

import { useState, type FormEvent } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import type { ContainerStats } from "@/lib/docker-stats";
import { validateProjectLimits, type Limits } from "@/lib/limits";

interface Props {
  project: PublicProject;
  onSaved: () => void;
}

const STATS_REFRESH_MS = 5000;
const WARN_RATIO = 0.8;
const BAD_RATIO = 0.95;

function meterClass(ratio: number): string {
  if (ratio >= BAD_RATIO) return "meter bad";
  if (ratio >= WARN_RATIO) return "meter warn";
  return "meter";
}

/** Live CPU and memory use, and this project's own limits (blank means the global limit applies). */
export function RuntimeResources({ project, onSaved }: Props) {
  const isRunning = project.status === "running";
  const stats = useFetch<{ stats: ContainerStats | null }>(isRunning ? `/api/projects/${project.id}/stats` : null, STATS_REFRESH_MS).data?.stats ?? null;
  const settings = useFetch<{ limits: Limits; hostCpus: number }>("/api/settings").data;

  const own = project.config.limits ?? {};
  const [memory, setMemory] = useState(own.memory ?? "");
  const [cpus, setCpus] = useState(own.cpus ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const checked = validateProjectLimits({ memory, cpus }, settings?.hostCpus ?? 1024);
  const isChanged = memory.trim() !== (own.memory ?? "") || cpus.trim() !== (own.cpus ?? "");
  const memoryRatio = stats ? stats.memoryMB / Math.max(stats.memoryLimitMB, 1) : 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!checked.ok) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const result = await api<{ applied: boolean }>(`/api/projects/${project.id}/limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory, cpus }),
      });
      setMessage({ ok: true, text: result.applied ? "Saved and applied to the running app." : "Saved. It applies the next time the app starts." });
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={save} aria-labelledby="runtime-resources-heading">
      <div className="card-head"><h2 className="h3" id="runtime-resources-heading">Resources</h2></div>
      <div className="card-pad stack">
        {isRunning && !stats && <p className="sub">Reading usage…</p>}
        {!isRunning && <p className="sub">Usage shows while the app is running.</p>}
        {stats && (
          <div className="stack-sm">
            <div className="meter-head"><span>Memory</span><span className="muted mono">{Math.round(stats.memoryMB)} / {Math.round(stats.memoryLimitMB)} MB</span></div>
            <div className={meterClass(memoryRatio)} role="progressbar" aria-label="Memory in use" aria-valuenow={Math.round(memoryRatio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${Math.min(100, Math.round(memoryRatio * 100))}%` }} />
            </div>
            <div className="meter-head"><span>CPU</span><span className="muted mono">{stats.cpuPercent.toFixed(1)}%</span></div>
          </div>
        )}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label className="field">
            <span className="label">Memory limit</span>
            <input className="input mono" value={memory} onChange={(e) => setMemory(e.target.value)} placeholder={settings ? `${settings.limits.memory} (default)` : "default"} autoComplete="off" />
            {checked.ok === false && checked.errors.memory && <span className="hint" style={{ color: "var(--error)" }}>{checked.errors.memory}</span>}
          </label>
          <label className="field">
            <span className="label">CPU limit</span>
            <input className="input mono" value={cpus} onChange={(e) => setCpus(e.target.value)} placeholder={settings ? `${settings.limits.cpus} (default)` : "default"} autoComplete="off" />
            {checked.ok === false && checked.errors.cpus && <span className="hint" style={{ color: "var(--error)" }}>{checked.errors.cpus}</span>}
          </label>
        </div>
        {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
      </div>
      <div className="card-foot">
        <span className="small muted">Leave a field empty to use the limit from Settings. Changes apply right away, with no restart.</span>
        <button type="submit" className="btn primary sm" disabled={!checked.ok || !isChanged || isSaving}>{isSaving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
