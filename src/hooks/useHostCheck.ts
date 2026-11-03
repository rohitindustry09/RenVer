"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

export type HostCheckState = "idle" | "checking" | "available" | "unavailable";

interface CheckResponse {
  available: boolean;
  host: string | null;
  reason: string | null;
}

export interface HostCheckResult {
  state: HostCheckState;
  host: string | null;
  message: string | null;
}

const DEBOUNCE_MS = 300;
const IDLE: HostCheckResult = { state: "idle", host: null, message: null };

/** Debounced check that a domain + label make a valid hostname that nothing else uses. */
export function useHostCheck(domainId: string, label: string): HostCheckResult {
  const [result, setResult] = useState<HostCheckResult>(IDLE);

  useEffect(() => {
    if (!domainId) {
      setResult(IDLE);
      return;
    }
    setResult({ state: "checking", host: null, message: null });
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const query = `domainId=${encodeURIComponent(domainId)}&label=${encodeURIComponent(label)}`;
        const check = await api<CheckResponse>(`/api/hosts/check?${query}`);
        if (stale) return;
        setResult(
          check.available
            ? { state: "available", host: check.host, message: null }
            : { state: "unavailable", host: null, message: check.reason },
        );
      } catch {
        if (!stale) setResult(IDLE);
      }
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [domainId, label]);

  return result;
}
