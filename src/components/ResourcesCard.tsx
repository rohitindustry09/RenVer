"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { memoryToMb, validateLimits, type Limits } from "@/lib/limits";

export interface ResourceInfo {
  limits: Limits;
  hostCpus: number;
  totalMemoryMB: number;
  runningApps: number;
  usedPorts: number[];
}

interface Props {
  info: ResourceInfo;
  onSaved: () => void;
}

interface SaveResult {
  limits: Limits;
  applied: string[];
  failed: string[];
}

const MB_PER_GB = 1024;
const WARN_RATIO = 0.8;

const formatMb = (mb: number): string => (mb >= MB_PER_GB ? `${(mb / MB_PER_GB).toFixed(1)} GB` : `${mb} MB`);

function FieldHint({ error, children }: { error?: string; children: React.ReactNode }) {
  return <span className="hint" style={error ? { color: "var(--error)" } : undefined}>{error ?? children}</span>;
}

export function ResourcesCard({ info, onSaved }: Props) {
  const [memory, setMemory] = useState(info.limits.memory);
  const [cpus, setCpus] = useState(info.limits.cpus);
  const [port, setPort] = useState(String(info.limits.hostPortStart));
  const [applyNow, setApplyNow] = useState(info.runningApps > 0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const checked = validateLimits({ memory, cpus, hostPortStart: port }, info.hostCpus);
  const errors = checked.ok ? {} : checked.errors;
  const isChanged =
    checked.ok &&
    (checked.value.memory !== info.limits.memory ||
      checked.value.cpus !== info.limits.cpus ||
      checked.value.hostPortStart !== info.limits.hostPortStart);

  const perApp = checked.ok ? memoryToMb(checked.value.memory) : null;
  const reservedMb = perApp === null ? null : perApp * Math.max(info.runningApps, 1);
  const isTight = reservedMb !== null && reservedMb > info.totalMemoryMB * WARN_RATIO;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const result = await api<SaveResult>("/api/settings/limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory, cpus, hostPortStart: port, applyToRunning: applyNow }),
      });
      const parts = ["Saved. New deploys use these limits."];
      if (result.applied.length) parts.push(`Applied to ${result.applied.join(", ")} right now.`);
      if (result.failed.length) parts.push(`Could not update ${result.failed.join(", ")}; redeploy to apply.`);
      setMessage({ ok: result.failed.length === 0, text: parts.join(" ") });
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={save} aria-labelledby="resources-heading">
      <div className="card-head">
        <h2 className="h3" id="resources-heading">Resources</h2>
        <p className="sub">
          How much of this machine each app may use. This is a safety limit: an app that goes over it is restarted on its own,
          and your other apps and RenVer keep running.
        </p>
      </div>

      <div className="card-pad stack">
        <div className="row" style={{ border: 0, padding: 0, alignItems: "flex-start", flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 200px" }}>
            <span className="label">Memory per app</span>
            <input className="input mono" value={memory} onChange={(e) => setMemory(e.target.value)} spellCheck={false} aria-label="Memory per app" />
            <FieldHint error={errors.memory}>For example 256m, 512m or 1g.</FieldHint>
          </label>
          <label className="field" style={{ flex: "1 1 200px" }}>
            <span className="label">CPUs per app</span>
            <input className="input mono" value={cpus} onChange={(e) => setCpus(e.target.value)} spellCheck={false} aria-label="CPUs per app" />
            <FieldHint error={errors.cpus}>
              1 = one full CPU core, 0.5 = half. This machine has {info.hostCpus}.
            </FieldHint>
          </label>
        </div>

        {reservedMb !== null && (
          <p className={`notice${isTight ? " warn" : ""}`} role="status">
            {Math.max(info.runningApps, 1)} app{Math.max(info.runningApps, 1) === 1 ? "" : "s"} × {memory.trim()} ={" "}
            <strong>{formatMb(reservedMb)}</strong> if every app uses its full share, out of {formatMb(info.totalMemoryMB)} on this
            machine.{isTight && " That leaves little for RenVer, Docker and your system, so consider a lower limit."}
          </p>
        )}

        <label className="field">
          <span className="label">First local port</span>
          <input className="input mono" style={{ maxWidth: 200 }} value={port} onChange={(e) => setPort(e.target.value)} spellCheck={false} aria-label="First local port" />
          <FieldHint error={errors.hostPortStart}>
            Every app listens on a private port on this machine, starting here: the first app gets this number, the next one
            more, and so on. Caddy forwards each web address to its app&apos;s port; visitors never see these numbers and they
            are not reachable from outside. Change it only if another program on this computer already uses ports from{" "}
            {info.limits.hostPortStart} upwards. It only affects apps deployed from now on.
            {info.usedPorts.length > 0 && <> In use now: <span className="mono">{info.usedPorts.join(", ")}</span>.</>}
          </FieldHint>
        </label>

        {info.runningApps > 0 && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
            <span>
              Also apply the memory and CPU limits to the {info.runningApps} app{info.runningApps === 1 ? "" : "s"} already running
              <span className="muted"> (no restart needed)</span>
            </span>
          </label>
        )}

        {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
      </div>

      <div className="card-foot">
        <span className="small muted">Databases use a fixed 1 GB limit.</span>
        <button type="submit" className="btn primary sm" disabled={isSaving || !checked.ok || !isChanged}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
