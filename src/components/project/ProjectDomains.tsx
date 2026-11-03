"use client";

import { Fragment, useEffect, useState } from "react";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { HostPicker } from "@/components/domains/HostPicker";
import { isUsable, type DomainsPayload } from "@/components/domains/types";
import { useFetch } from "@/hooks/useFetch";
import { useHostCheck } from "@/hooks/useHostCheck";
import { api } from "@/lib/client-api";
import { hostUrl } from "@/lib/domain-names";

interface Props {
  projectId: string;
  primaryHost: string;
  hosts: string[];
  onChanged: () => void;
}

/** Lists a project's addresses and lets you add (or remove) subdomains and root domains. */
export function ProjectDomains({ projectId, primaryHost, hosts, onChanged }: Props) {
  const { data: domainData, reload: reloadDomains } = useFetch<DomainsPayload>("/api/domains");
  const [domainId, setDomainId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"add" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingHost, setRemovingHost] = useState<string | null>(null);

  useEffect(() => {
    if (domainId || !domainData) return;
    const first = domainData.domains.find(isUsable);
    if (first) setDomainId(first.id);
  }, [domainData, domainId]);

  const check = useHostCheck(domainId, label);

  const add = async () => {
    setBusy("add");
    setError(null);
    try {
      await api(`/api/projects/${projectId}/hosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, label }),
      });
      setLabel("");
      onChanged();
      void reloadDomains();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the address.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (host: string) => {
    setBusy(host);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/hosts?host=${encodeURIComponent(host)}`, { method: "DELETE" });
      onChanged();
      void reloadDomains();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the address.");
    } finally {
      setBusy(null);
      setRemovingHost(null);
    }
  };

  return (
    <section className="card" aria-labelledby="project-domains-heading">
      <div className="card-head">
        <h2 className="h3" id="project-domains-heading">Domains</h2>
        <p className="sub">Every address below reaches this project. Add a subdomain, or put it directly on a root domain.</p>
      </div>
      <ul className="rows">
        {hosts.map((host) => (
          <Fragment key={host}>
            <li className="row">
              <div className="row-main">
                <a className="row-title mono" href={hostUrl(host)} target="_blank" rel="noopener noreferrer">{host}</a>
              </div>
              <div className="row-end">
                {host === primaryHost && <span className="badge">Primary</span>}
                <button
                  type="button"
                  className="btn sm danger"
                  disabled={hosts.length <= 1 || busy !== null || removingHost === host}
                  title={hosts.length <= 1 ? "A project needs at least one address" : undefined}
                  onClick={() => setRemovingHost(host)}
                >
                  Remove
                </button>
              </div>
            </li>
            {removingHost === host && (
              <ConfirmDelete
                title="Remove address"
                phrase={host}
                message="This address will stop reaching the project."
                actionLabel="Remove address"
                busyLabel="Removing…"
                isBusy={busy === host}
                onConfirm={() => remove(host)}
                onCancel={() => setRemovingHost(null)}
              />
            )}
          </Fragment>
        ))}
      </ul>
      <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="label" style={{ fontWeight: 500 }}>Add an address</span>
        {domainData && (
          <HostPicker
            domains={domainData.domains}
            domainId={domainId}
            label={label}
            check={check}
            onDomainChange={setDomainId}
            onLabelChange={setLabel}
            idPrefix="project-host"
          />
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn primary sm" disabled={check.state !== "available" || busy !== null} onClick={add}>
          {busy === "add" ? "Adding…" : "Add address"}
        </button>
      </div>
    </section>
  );
}
