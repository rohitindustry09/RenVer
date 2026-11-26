"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { CopyButton } from "../CopyButton";

interface Props {
  project: PublicProject;
}

/** Share a running project on a temporary public address through a Cloudflare quick tunnel. */
export function ShareCard({ project }: Props) {
  const url = `/api/projects/${project.id}/tunnel`;
  const { data, reload } = useFetch<{ url: string | null }>(url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = data?.url ?? null;
  const canShare = project.status === "running" && project.hostPort !== null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(url, { method: publicUrl ? "DELETE" : "POST" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="share-heading">
      <div className="card-head">
        <h2 className="h3" id="share-heading">Share publicly</h2>
        <p className="sub">
          Gives this app a temporary public https address through Cloudflare, even from a home computer with no open ports.
        </p>
      </div>
      <div className="card-pad stack-sm">
        {publicUrl ? (
          <>
            <div className="status-line">
              <span className="dot ok" aria-hidden="true" />
              <div>
                <div className="row-title">Shared</div>
                <div className="row-desc">Anyone with this link can open the app.</div>
              </div>
            </div>
            <div className="link-box">
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">{publicUrl}</a>
              <CopyButton text={publicUrl} />
              <a className="btn sm" href={publicUrl} target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          </>
        ) : (
          <div className="status-line">
            <span className="dot" aria-hidden="true" />
            <div>
              <div className="row-title">Not shared</div>
              <div className="row-desc">
                {canShare
                  ? "The link changes each time you share, and stops when you stop sharing, pause the project or restart the panel."
                  : "The project must be running before it can be shared."}
              </div>
            </div>
          </div>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className={`btn${publicUrl ? "" : " primary"}`} disabled={busy || (!publicUrl && !canShare)} onClick={() => void toggle()}>
          {busy ? (publicUrl ? "Stopping…" : "Starting…") : publicUrl ? "Stop sharing" : "Share publicly"}
        </button>
      </div>
    </section>
  );
}
