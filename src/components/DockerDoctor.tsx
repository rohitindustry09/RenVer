"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import type { DockerAction, DockerDiagnosis } from "@/lib/docker-doctor";
import { ConfirmDialog } from "./ConfirmDialog";

/** After starting Docker it is asked every few seconds whether it answers, but only for a limited time. */
const POLL_MS = 3000;
const WAIT_MS = 3 * 60 * 1000;
/** While Docker Desktop is still booting, the doctor looks again by itself. */
const BOOT_RECHECK_MS = 5000;

interface Props {
  /** Raised by "Fix everything": when it changes, a safe fix is run (starting Docker, never a restart). */
  fixSignal: number;
  /** Called when Docker answers, so the rest of the Setup page can refresh. */
  onChanged: () => void | Promise<void>;
}

const MARK: Record<string, { text: string; className: string }> = {
  ok: { text: "✓", className: "ok" },
  fail: { text: "✗", className: "fail" },
  unknown: { text: "–", className: "unknown" },
};

const markFor = (ok: boolean | null) => MARK[ok === null ? "unknown" : ok ? "ok" : "fail"]!;

/** Checks every step Docker needs, says what is wrong in plain words, and does what it can about it. */
export function DockerDoctor({ fixSignal, onChanged }: Props) {
  const [diagnosis, setDiagnosis] = useState<DockerDiagnosis | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const isMounted = useRef(true);
  const onChangedRef = useRef(onChanged);
  const isActing = progress !== null;

  useEffect(() => {
    onChangedRef.current = onChanged;
  });
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const check = useCallback(async (): Promise<DockerDiagnosis | null> => {
    setIsChecking(true);
    try {
      const result = await api<{ running: boolean; diagnosis: DockerDiagnosis }>("/api/system/docker?diagnose=1");
      if (!isMounted.current) return null;
      setDiagnosis(result.diagnosis);
      setError(null);
      if (result.running) await onChangedRef.current();
      return result.diagnosis;
    } catch (e) {
      if (isMounted.current) setError(e instanceof Error ? e.message : "Could not check Docker.");
      return null;
    } finally {
      if (isMounted.current) setIsChecking(false);
    }
  }, []);

  const act = useCallback(
    async (action: DockerAction) => {
      setError(null);
      setProgress("Starting…");
      const startedAt = Date.now();
      try {
        await api("/api/system/docker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
        while (isMounted.current && Date.now() - startedAt < WAIT_MS) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (isMounted.current) setProgress(`Waiting for Docker to answer… ${Math.round((Date.now() - startedAt) / 1000)}s`);
          const { running } = await api<{ running: boolean }>("/api/system/docker");
          if (running) break;
        }
      } catch (e) {
        if (isMounted.current) setError(e instanceof Error ? e.message : "Could not start Docker.");
      }
      if (isMounted.current) setProgress(null);
      // Whatever happened, look again: it is either running now, or the steps show why it is not.
      await check();
    },
    [check],
  );

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (diagnosis?.state !== "engine-starting" || isActing) return;
    const timer = setInterval(() => void check(), BOOT_RECHECK_MS);
    return () => clearInterval(timer);
  }, [diagnosis?.state, isActing, check]);

  const actRef = useRef(act);
  const checkRef = useRef(check);
  useEffect(() => {
    actRef.current = act;
    checkRef.current = check;
  });
  useEffect(() => {
    if (fixSignal === 0) return;
    void (async () => {
      const found = await checkRef.current();
      if (found?.action === "start") await actRef.current("start");
    })();
  }, [fixSignal]);

  return (
    <div className="card-pad stack-sm doctor" style={{ borderTop: "1px solid var(--border)" }}>
      {isConfirming && (
        <ConfirmDialog
          title="Restart Docker and WSL?"
          message="This closes Docker Desktop, shuts WSL down and starts Docker Desktop again. Any other WSL (Linux) sessions you have open will be stopped too. Your containers and images are kept."
          confirmLabel="Restart"
          tone="danger"
          onConfirm={() => {
            setIsConfirming(false);
            void act("restart");
          }}
          onCancel={() => setIsConfirming(false)}
        />
      )}
      <div className="row-title">Docker check</div>
      {diagnosis ? (
        <ul className="doctor-steps" aria-label="Docker checks">
          {diagnosis.steps.map((step) => {
            const mark = markFor(step.ok);
            return (
              <li key={step.id}>
                <span className={`mark ${mark.className}`} aria-hidden="true">{mark.text}</span>
                <span>
                  {step.label} <span className="muted">· {step.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted">Checking Docker…</p>
      )}
      {diagnosis && <p className="small" role="status">{diagnosis.advice}</p>}
      {progress && <p className="small muted" role="status">{progress}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="toolbar">
        {diagnosis?.action === "start" && (
          <button type="button" className="btn sm primary" disabled={isActing || isChecking} onClick={() => void act("start")}>
            {isActing ? "Starting…" : "Start Docker"}
          </button>
        )}
        {diagnosis?.action === "restart" && (
          <button type="button" className="btn sm primary" disabled={isActing || isChecking} onClick={() => setIsConfirming(true)}>
            {isActing ? "Restarting…" : "Restart Docker and WSL"}
          </button>
        )}
        <button type="button" className="btn sm" disabled={isActing || isChecking} onClick={() => void check()}>
          {isChecking ? "Checking…" : "Check again"}
        </button>
      </div>
    </div>
  );
}
