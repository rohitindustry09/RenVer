"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";

const POLL_MS = 2000;
/** Keep the newest part only, so a log left open for days does not grow the page without limit. */
const MAX_CHARS = 200_000;

/** The panel's own output (what its terminal window would show), refreshed while `isActive`. */
export function usePanelLog(isActive: boolean): string {
  const [text, setText] = useState("");
  const offset = useRef(-1);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const chunk = await api<{ text: string; next: number }>(`/api/system/panel-log?offset=${offset.current}`);
        if (cancelled) return;
        offset.current = chunk.next;
        if (chunk.text) setText((previous) => (previous + chunk.text).slice(-MAX_CHARS));
      } catch {
        // the panel may be restarting: try again on the next tick
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isActive]);

  return text;
}
