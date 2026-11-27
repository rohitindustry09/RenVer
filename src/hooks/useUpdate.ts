"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import type { UpdateState } from "@/lib/update-job";

interface UpdatePoll {
  state: UpdateState;
  supervised: boolean;
  version?: { commit: string; subject: string } | null;
  log: { text: string; next: number };
}

const POLL_MS = 1000;
const HEALTH_MS = 2000;
const IDLE: UpdateState = { status: "idle", step: null, message: "", startedAt: null, finishedAt: null };

/** Starts an update and follows its log. While the panel restarts it waits for it to come back, then reloads the page. */
export function useUpdate() {
  const [state, setState] = useState<UpdateState>(IDLE);
  const [log, setLog] = useState("");
  const [supervised, setSupervised] = useState(true);
  const [version, setVersion] = useState<{ commit: string; subject: string } | null>(null);
  const [isDown, setIsDown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);

  const refresh = useCallback(async (withVersion = false) => {
    try {
      const poll = await api<UpdatePoll>(`/api/system/update?offset=${offset.current}${withVersion ? "&version=1" : ""}`);
      setIsDown(false);
      offset.current = poll.log.next;
      if (poll.log.text) setLog((previous) => previous + poll.log.text);
      setState(poll.state);
      setSupervised(poll.supervised);
      if (poll.version !== undefined) setVersion(poll.version);
    } catch {
      // The panel stopped answering: that is expected while it restarts.
      setIsDown(true);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const isBusy = state.status === "running" || state.status === "restarting";

  useEffect(() => {
    if (!isBusy || isDown) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [isBusy, isDown, refresh]);

  // Once the panel went away during an update, wait until it answers again and then load the new version of the page.
  useEffect(() => {
    if (!isDown) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (response.ok) window.location.reload();
      } catch {
        // still restarting
      }
    }, HEALTH_MS);
    return () => clearInterval(timer);
  }, [isDown]);

  const start = useCallback(
    async (force: boolean) => {
      setError(null);
      setLog("");
      offset.current = 0;
      try {
        await api("/api/system/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
        setState({ ...IDLE, status: "running" });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the update.");
      }
    },
    [refresh],
  );

  return { state, log, supervised, version, isDown, isBusy, error, start };
}
