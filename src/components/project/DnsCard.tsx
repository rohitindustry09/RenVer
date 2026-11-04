"use client";

import { useEffect, useState } from "react";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { PUBLIC_DNS, findDnsFailure, validateDnsServers } from "@/lib/dns-servers";

interface Props {
  project: PublicProject;
  onSaved: () => void;
}

const LOG_LINES = 400;

/** Finds an app that cannot look up names (ENOTFOUND, EAI_AGAIN) and gives it reliable DNS with one click. */
export function DnsCard({ project, onSaved }: Props) {
  const saved = project.config.dns ?? [];
  const [text, setText] = useState(saved.join(", "));
  const [failure, setFailure] = useState<{ host: string | null; line: string } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const isRunning = project.status === "running";
  const checked = validateDnsServers(text);
  const isChanged = checked.ok && checked.value.join(",") !== saved.join(",");

  const scanLogs = async () => {
    if (!isRunning) return;
    setIsChecking(true);
    try {
      const result = await api<{ lines: string[] }>(`/api/projects/${project.id}/logs?lines=${LOG_LINES}`);
      setFailure(findDnsFailure(result.lines));
    } catch {
      setFailure(null);
    } finally {
      setIsChecking(false);
    }
  };

  // Read the logs again whenever a new container is serving: after a redeploy the old container's lines are gone.
  useEffect(() => {
    void scanLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, isRunning, project.container]);

  const save = async (servers: string[], thenRedeploy: boolean) => {
    setIsBusy(true);
    setError(null);
    setNote(null);
    try {
      await api(`/api/projects/${project.id}/dns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servers }),
      });
      if (thenRedeploy) {
        await api(`/api/projects/${project.id}/redeploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        // The warning came from the old container's logs; it no longer applies. The card checks again once the new one runs.
        setFailure(null);
        setNote("Saved. The app is being deployed again with these DNS servers. This card checks the new logs when it is running.");
      } else {
        setNote("Saved. It takes effect on the next deploy: press Redeploy.");
      }
      setText(servers.join(", "));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="dns-heading">
      <div className="card-head"><h2 className="h3" id="dns-heading">DNS</h2></div>
      <div className="card-pad stack-sm">
        {failure && (
          <div className="notice warn" role="status">
            <span>
              <strong>This app could not look up {failure.host ? <span className="mono">{failure.host}</span> : "a name"}.</strong>{" "}
              {saved.length > 0
                ? `This app already uses DNS servers (${saved.join(", ")}) and still fails. Check that the name is spelled right and that the server allows outgoing DNS (port 53). If this line is old, press "Check again" after the deploy has finished.`
                : `That usually means the server's DNS is unreliable for some names. Giving this app public DNS servers (${PUBLIC_DNS.join(", ")}) normally fixes it.`}
              <br />
              <span className="small mono muted" style={{ overflowWrap: "anywhere" }}>{failure.line}</span>
            </span>
          </div>
        )}
        {failure && saved.length === 0 && (
          <div className="toolbar">
            <button type="button" className="btn primary sm" disabled={isBusy || project.status === "deploying"} onClick={() => void save(PUBLIC_DNS, true)}>
              {isBusy ? "Working…" : "Use public DNS and redeploy"}
            </button>
          </div>
        )}
        {!failure && isRunning && (
          <p className="small muted">{isChecking ? "Checking the app's recent logs…" : "No name lookup problems in the app's recent logs."}</p>
        )}
        <label className="field">
          <span className="label">DNS servers for this app (optional)</span>
          <input
            className="input mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="empty = the server's own DNS, e.g. 1.1.1.1, 8.8.8.8"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {!checked.ok && <p className="notice error" role="alert">{checked.error}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {note && <p className="notice" role="status">{note}</p>}
        <p className="small muted">Only this app uses these servers. Other apps keep the server&apos;s DNS. It takes effect on the next deploy.</p>
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end", gap: 8 }}>
        {isRunning && (
          <button type="button" className="btn" disabled={isChecking} onClick={() => void scanLogs()}>{isChecking ? "Checking…" : "Check again"}</button>
        )}
        <button type="button" className="btn primary" disabled={isBusy || !isChanged || !checked.ok} onClick={() => checked.ok && void save(checked.value, false)}>
          Save
        </button>
      </div>
    </section>
  );
}
