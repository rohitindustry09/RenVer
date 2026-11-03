"use client";

import { useState } from "react";
import { AddDomainForm } from "@/components/domains/AddDomainForm";
import { DomainCard } from "@/components/domains/DomainCard";
import { ServerIpCard } from "@/components/domains/ServerIpCard";
import type { DomainsPayload } from "@/components/domains/types";
import { RowsSkeleton } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";

const REFRESH_MS = 5000;

export default function DomainsPage() {
  const { data, error, reload } = useFetch<DomainsPayload>("/api/domains", REFRESH_MS);
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const syncRoutes = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const sync = await api<{ applied: boolean; message: string }>("/api/proxy/sync", { method: "POST" });
      setSyncMessage({ ok: sync.applied, text: sync.message });
      await reload();
    } catch (e) {
      setSyncMessage({ ok: false, text: e instanceof Error ? e.message : "Could not sync routes." });
    } finally {
      setIsSyncing(false);
    }
  };

  if (error && !data) return <p className="notice error" role="alert">{error}</p>;
  if (!data) return <RowsSkeleton label="Loading domains" />;

  const serverIp = data.serverAddresses[0] ?? "<your server IP>";

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">Domains</h1>
          <p className="sub">
            Add the domains you own. Each project can then live on a subdomain of any of them, or directly on the domain.
          </p>
        </div>
        {!isAdding && <button type="button" className="btn primary" onClick={() => setIsAdding(true)}>Add domain</button>}
      </div>

      <div className="stack">
        {isAdding && (
          <AddDomainForm
            onCancel={() => setIsAdding(false)}
            onAdded={() => {
              setIsAdding(false);
              void reload();
            }}
          />
        )}

        {data.domains.length === 0 && !isAdding && (
          <div className="empty">
            <h2 className="h3">No domains yet</h2>
            <p className="sub">Add your first domain to give projects their own addresses.</p>
            <button type="button" className="btn primary" onClick={() => setIsAdding(true)}>Add domain</button>
          </div>
        )}

        {data.domains.map((domain) => (
          <DomainCard key={domain.id} domain={domain} serverIp={serverIp} onChanged={reload} />
        ))}

        <ServerIpCard
          key={data.configuredServerIp ?? "none"}
          detected={data.serverAddresses}
          configured={data.configuredServerIp}
          onSaved={reload}
        />

        <section className="card" aria-labelledby="proxy-heading">
          <div className="row">
            <span className={`dot ${data.proxy.running ? "ok" : "warn"}`} aria-hidden="true" />
            <div className="row-main">
              <h2 className="h3" id="proxy-heading">Proxy (Caddy)</h2>
              <div className="row-desc">
                {data.proxy.running
                  ? "Running. It sends each address to its app and gets HTTPS certificates for real domains."
                  : "Not running. It starts automatically on the next deploy, or press Sync routes."}
              </div>
            </div>
            <div className="row-end">
              <button type="button" className="btn sm" disabled={isSyncing} onClick={syncRoutes}>
                {isSyncing ? "Syncing…" : "Sync routes"}
              </button>
            </div>
          </div>
          {syncMessage && (
            <p className={`notice${syncMessage.ok ? "" : " error"}`} style={{ margin: "0 24px 16px" }} role="status">
              {syncMessage.text}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
