"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";

type JobStatus = "idle" | "running" | "done" | "failed";

interface InstallPoll {
  status: JobStatus;
  log: { text: string; next: number };
}

const POLL_MS = 1500;

/** Starts a server-side install and streams its log until it finishes, then calls onFinished. */
export function useInstaller(onFinished: () => void | Promise<void>) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<"done" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unmounted = useRef(false);
  const finished = useRef(onFinished);

  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const follow = useCallback(async (tool: string) => {
    let offset = 0;
    while (!unmounted.current) {
      const poll = await api<InstallPoll>(`/api/system/install?tool=${tool}&offset=${offset}`);
      offset = poll.log.next;
      if (poll.log.text) setLog((prev) => prev + poll.log.text);
      if (poll.status === "done" || poll.status === "failed") {
        setResult(poll.status);
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }, []);

  const start = useCallback(
    async (tool: string) => {
      setError(null);
      setLog("");
      setResult(null);
      setInstalling(tool);
      try {
        await api("/api/system/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool }),
        });
        await follow(tool);
        await finished.current();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Install failed");
      } finally {
        setInstalling(null);
      }
    },
    [follow],
  );

  return { installing, log, result, error, start };
}
