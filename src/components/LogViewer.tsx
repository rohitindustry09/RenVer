"use client";

import { useEffect, useRef, useState } from "react";
import type { Deploy } from "@/lib/db";
import { isBusyStatus, statusLabel } from "@/lib/format";
import { api } from "@/lib/client-api";
import { LogPanel } from "./LogPanel";

interface Props {
  deployId: string;
  onFinished?: (deploy: Deploy) => void;
}

interface DeployPoll {
  deploy: Deploy;
  log: { text: string; next: number };
}

const POLL_MS = 1500;

export function LogViewer({ deployId, onFinished }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Deploy["status"]>("queued");
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);
  const finishedRef = useRef(onFinished);

  useEffect(() => {
    finishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    offset.current = 0;
    setText("");
    setError(null);

    const poll = async () => {
      let delay = POLL_MS;
      try {
        const result = await api<DeployPoll>(`/api/deploys/${deployId}?offset=${offset.current}`);
        if (stopped) return;
        setError(null);
        offset.current = result.log.next;
        if (result.log.text) setText((prev) => prev + result.log.text);
        setStatus(result.deploy.status);

        const isFinal = result.deploy.status === "live" || result.deploy.status === "failed";
        if (isFinal && !result.log.text) {
          finishedRef.current?.(result.deploy);
          return;
        }
        // A finished deploy may still have unread log (reads are capped), so keep draining it.
        if (isFinal) delay = 0;
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "Lost connection");
      }
      if (!stopped) timer = setTimeout(poll, delay);
    };

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deployId]);

  return (
    <div className="stack-sm">
      <span className="status" role="status">
        <span className={`dot ${status}${isBusyStatus(status) ? " pulse" : ""}`} aria-hidden="true" />
        {statusLabel(status)}
      </span>
      {error && <p className="notice error">{error}</p>}
      <LogPanel text={text} ariaLabel="Deploy log" />
    </div>
  );
}
