"use client";

import Link from "next/link";
import { useState } from "react";
import type { Deploy } from "@/lib/db";
import { LogViewer } from "../LogViewer";

interface Props {
  deployId: string;
  projectId: string;
  url: string;
  onBack: () => void;
}

export function DeployProgress({ deployId, projectId, url, onBack }: Props) {
  const [result, setResult] = useState<Deploy | null>(null);
  const isLive = result?.status === "live";
  const isFailed = result?.status === "failed";

  return (
    <div className="stack">
      {isLive && (
        <div className="card success-card">
          <div className="success-mark" aria-hidden="true">✓</div>
          <h2 className="h2">Your project is live</h2>
          <a className="mono muted" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
          <div className="toolbar">
            <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">Visit</a>
            <Link className="btn" href={`/projects/${projectId}`}>Go to project</Link>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="notice error" role="alert">
          <div className="stack-sm">
            <strong>The deploy failed.</strong>
            <span>{result?.error ?? "See the log below for details."}</span>
            <div className="toolbar">
              <button type="button" className="btn sm" onClick={onBack}>Back to settings</button>
              <Link className="btn sm ghost" href="/">Go to dashboard</Link>
            </div>
          </div>
        </div>
      )}

      <section className="card" aria-labelledby="build-log-heading">
        <div className="card-head"><h2 className="h3" id="build-log-heading">Build log</h2></div>
        <div className="card-pad">
          <LogViewer deployId={deployId} onFinished={setResult} />
        </div>
      </section>
    </div>
  );
}
