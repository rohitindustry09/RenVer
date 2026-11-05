"use client";

import { useEffect, useMemo, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import type { CleanupCategory, CleanupScan } from "@/lib/cleanup";
import { formatBytes } from "@/lib/format";
import { ConfirmDialog } from "./ConfirmDialog";

interface Step {
  label: string;
  ok: boolean;
  message: string;
}

interface Result {
  freedBytes: number;
  steps: Step[];
}

/** Shows what can be cleaned from the server's disk, with sizes and whether each part can hold data, and cleans what is chosen. */
export function CleanupCard() {
  const { data, error, reload } = useFetch<CleanupScan>("/api/system/cleanup");
  const [wholeChosen, setWholeChosen] = useState<Set<string>>(new Set());
  const [volumesChosen, setVolumesChosen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Start with the safe categories ticked; volumes (which can hold data) are never ticked for you.
  const scanKey = data ? data.categories.map((c) => `${c.id}:${c.count}`).join(",") : "";
  useEffect(() => {
    if (!data) return;
    setWholeChosen(new Set(data.categories.filter((c) => !c.pickItems && c.defaultSelected).map((c) => c.id)));
    setVolumesChosen(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey]);

  const selectedBytes = useMemo(() => {
    if (!data) return 0;
    return data.categories.reduce((total, c) => {
      if (c.pickItems) return total + c.items.filter((i) => volumesChosen.has(i.id)).reduce((s, i) => s + i.bytes, 0);
      return total + (wholeChosen.has(c.id) ? c.bytes : 0);
    }, 0);
  }, [data, wholeChosen, volumesChosen]);

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const toggleCategory = (c: CleanupCategory) => {
    if (!c.pickItems) return setWholeChosen((s) => toggle(s, c.id));
    const allChosen = c.items.every((i) => volumesChosen.has(i.id));
    setVolumesChosen((s) => {
      const next = new Set(s);
      for (const item of c.items) {
        if (allChosen) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
    if (!allChosen) setOpen((s) => new Set(s).add(c.id));
  };

  const isChecked = (c: CleanupCategory): boolean => (c.pickItems ? c.items.length > 0 && c.items.every((i) => volumesChosen.has(i.id)) : wholeChosen.has(c.id));
  const hasVolumes = volumesChosen.size > 0;
  const hasChoice = hasVolumes || wholeChosen.size > 0;

  const clean = async () => {
    setIsBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const done = await api<Result>("/api/system/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildCache: wholeChosen.has("buildCache"), images: wholeChosen.has("images"), volumes: [...volumesChosen] }),
      });
      setResult(done);
      reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not clean up.");
    } finally {
      setIsBusy(false);
      setIsConfirming(false);
    }
  };

  const summary = data?.categories.filter((c) => (c.pickItems ? c.items.some((i) => volumesChosen.has(i.id)) : wholeChosen.has(c.id))).map((c) => c.title) ?? [];

  return (
    <section className="card" id="disk-cleanup" aria-labelledby="cleanup-heading">
      <div className="card-head">
        <h2 className="h3" id="cleanup-heading">Disk cleanup</h2>
        {data && <span className={`badge${data.totalBytes > 0 ? " warn" : " ok"}`}>{data.totalBytes > 0 ? `${formatBytes(data.totalBytes)} can be freed` : "Nothing to clean"}</span>}
      </div>

      {isConfirming && data && (
        <ConfirmDialog
          title={hasVolumes ? "Delete data permanently?" : "Clean up the disk?"}
          message={
            <>
              This removes: {summary.join(", ")}.{selectedBytes > 0 && <> It frees about <strong>{formatBytes(selectedBytes)}</strong>.</>}
              {hasVolumes ? " The volumes you ticked may hold data, and deleting them cannot be undone." : " Your running apps, databases, backups and settings are not touched."}
            </>
          }
          phrase={hasVolumes ? "delete" : undefined}
          confirmLabel={hasVolumes ? "Delete forever" : "Clean up"}
          busyLabel="Cleaning…"
          tone={hasVolumes ? "danger" : "primary"}
          isBusy={isBusy}
          onConfirm={() => void clean()}
          onCancel={() => setIsConfirming(false)}
        />
      )}

      <div className="card-pad stack-sm">
        {error && <p className="notice error" role="alert">{error}</p>}
        {!data && !error && <p className="small muted">Looking at what is on the disk…</p>}
        {data && data.categories.length === 0 && <p className="notice">Nothing unneeded was found. Everything on the disk is in use.</p>}
        {data && data.categories.length > 0 && (
          <p className="sub">
            Docker keeps old builds, images and leftovers that nothing uses any more. Tick what to remove, and press Details to see exactly what is in each part.
            Running apps, databases, backups, saved folders and settings are never touched.
          </p>
        )}

        {data?.categories.map((c) => {
          const isOpen = open.has(c.id);
          return (
            <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, display: "grid", gap: 8 }}>
              <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", minWidth: 0 }}>
                  <input type="checkbox" checked={isChecked(c)} onChange={() => toggleCategory(c)} style={{ marginTop: 4 }} />
                  <span style={{ display: "grid", gap: 2 }}>
                    <strong>{c.title} <span className="muted mono" style={{ fontWeight: 400 }}>· {formatBytes(c.bytes)} · {c.count} {c.count === 1 ? "item" : "items"}</span></strong>
                    <span className="small muted">{c.summary}</span>
                  </span>
                </label>
                <span className={`badge${c.containsData ? " warn" : " ok"}`} style={{ flexShrink: 0 }}>{c.containsData ? "May contain data" : "No personal data"}</span>
              </div>
              <p className="small muted" style={{ marginLeft: 26 }}>{c.dataNote}</p>
              <div style={{ marginLeft: 26 }}>
                <button type="button" className="btn sm" aria-expanded={isOpen} onClick={() => setOpen((s) => toggle(s, c.id))}>
                  {isOpen ? "Hide details" : "Details"}
                </button>
              </div>
              {isOpen && (
                <ul className="rows" style={{ listStyle: "none", marginLeft: 26 }}>
                  {c.items.map((item) => (
                    <li key={item.id} className="row" style={{ padding: "6px 0", alignItems: "center" }}>
                      {c.pickItems && (
                        <input
                          type="checkbox"
                          aria-label={`Remove ${item.label}`}
                          checked={volumesChosen.has(item.id)}
                          onChange={() => setVolumesChosen((s) => toggle(s, item.id))}
                          style={{ marginRight: 10 }}
                        />
                      )}
                      <div className="row-main" style={{ minWidth: 0 }}>
                        <div className="mono small" style={{ overflowWrap: "anywhere" }}>{item.label}</div>
                        <div className="small muted">{item.detail}</div>
                      </div>
                      <div className="row-end mono small">{formatBytes(item.bytes)}</div>
                    </li>
                  ))}
                  {c.count > c.items.length && <li className="small muted" style={{ padding: "6px 0" }}>…and {c.count - c.items.length} smaller {c.count - c.items.length === 1 ? "item" : "items"}.</li>}
                </ul>
              )}
            </div>
          );
        })}

        {data && data.other.count > 0 && (
          <p className="small muted">
            {data.other.count} unused {data.other.count === 1 ? "volume" : "volumes"} ({formatBytes(data.other.bytes)}) belong to other tools on this server (not RenVer). They are left alone.
          </p>
        )}

        {failure && <p className="notice error" role="alert">{failure}</p>}
        {result && (
          <div className="notice" role="status" style={{ display: "grid", gap: 4 }}>
            <strong>{result.freedBytes > 0 ? `Freed about ${formatBytes(result.freedBytes)}.` : "Done. Nothing more could be freed."}</strong>
            {result.steps.filter((s) => !s.ok).map((s) => <span key={s.label} className="small">{s.label}: {s.message}</span>)}
          </div>
        )}
      </div>

      <div className="card-foot" style={{ justifyContent: "space-between" }}>
        <span className="small muted">{hasChoice ? `Chosen: about ${formatBytes(selectedBytes)}` : "Nothing chosen"}</span>
        <span className="toolbar">
          <button type="button" className="btn" disabled={isBusy} onClick={reload}>Scan again</button>
          <button type="button" className={`btn primary${hasVolumes ? " danger" : ""}`} disabled={isBusy || !hasChoice} onClick={() => setIsConfirming(true)}>
            {isBusy ? "Cleaning…" : "Clean up"}
          </button>
        </span>
      </div>
    </section>
  );
}
