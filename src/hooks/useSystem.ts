"use client";

import { useCallback, useState } from "react";
import type { CheckResult } from "@/lib/preflight";
import { api } from "@/lib/client-api";
import { clientCache } from "@/lib/client-cache";
import { useFetch } from "./useFetch";

export interface InstallHint {
  available: boolean;
  text: string;
}

export interface SystemData {
  checks: CheckResult[];
  summary: { canInstall: boolean; toInstall: string[]; failures: string[]; warnings: string[] };
  baseDomain: string;
  mode: "local" | "production";
  installHints: Record<string, InstallHint>;
}

/** Tools the app cannot work without. */
export const REQUIRED_TOOLS = ["docker", "caddy", "git", "node"] as const;

export function missingRequirements(data: SystemData | null): CheckResult[] {
  if (!data) return [];
  return data.checks.filter(
    (c) => (REQUIRED_TOOLS as readonly string[]).includes(c.id) && c.status !== "ok",
  );
}

const SYSTEM_URL = "/api/system";

export function useSystem() {
  const { data, error, reload: refresh, isLoading } = useFetch<SystemData>(SYSTEM_URL);
  const [isChecking, setIsChecking] = useState(false);

  /** Pass fresh = true to bypass the server's short-lived cache (after an install or re-check). */
  const reload = useCallback(
    async (fresh = false) => {
      if (!fresh) return refresh();
      setIsChecking(true);
      try {
        clientCache.set(SYSTEM_URL, await api<SystemData>(`${SYSTEM_URL}?fresh=1`));
      } finally {
        setIsChecking(false);
      }
    },
    [refresh],
  );

  return { data, error, isLoading: isLoading || isChecking, reload };
}
