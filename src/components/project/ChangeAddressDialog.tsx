"use client";

import { useEffect, useState } from "react";
import { HostPicker } from "@/components/domains/HostPicker";
import { isUsable, type DomainItem } from "@/components/domains/types";
import { Modal } from "@/components/Modal";
import { useHostCheck } from "@/hooks/useHostCheck";
import { api } from "@/lib/client-api";

export interface AddressChange {
  host: string;
  /** Address variables that held the old address and now hold the new one. */
  updatedEnv: string[];
}

interface Props {
  projectId: string;
  oldHost: string;
  domains: DomainItem[];
  onDone: (change: AddressChange) => void;
  onClose: () => void;
}

/** Replaces one of the project's addresses with a new subdomain (or another domain) in a single step. */
/** The usable domain the current address sits on (the longest match), so the picker starts there. */
export function homeDomainOf(host: string, domains: readonly DomainItem[]): DomainItem | undefined {
  return domains
    .filter(isUsable)
    .filter((d) => host === d.name || host.endsWith(`.${d.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/** What is left of an address once its domain is taken off: "app.example.com" on "example.com" is "app". */
export function labelWithin(host: string, domainName: string): string {
  return host === domainName ? "" : host.slice(0, host.length - domainName.length - 1);
}

export function ChangeAddressDialog({ projectId, oldHost, domains, onDone, onClose }: Props) {
  const home = homeDomainOf(oldHost, domains);
  // Start from the current address, so only the part to change needs editing.
  const [domainId, setDomainId] = useState(home?.id ?? "");
  const [label, setLabel] = useState(home ? labelWithin(oldHost, home.name) : "");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (domainId) return;
    const first = domains.find(isUsable);
    if (first) setDomainId(first.id);
  }, [domains, domainId]);

  const check = useHostCheck(domainId, label);

  const change = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const result = await api<{ host: string; updatedEnv: string[] }>(`/api/projects/${projectId}/hosts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldHost, domainId, label }),
      });
      onDone({ host: result.host, updatedEnv: result.updatedEnv });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the address.");
      setIsBusy(false);
    }
  };

  return (
    <Modal title="Change address" onClose={isBusy ? () => {} : onClose}>
      <div className="stack-sm">
        <p className="sub">
          Replace <span className="mono">{oldHost}</span> with a new address. The new one starts working right away, and the old one
          stops reaching this project.
        </p>
        <HostPicker domains={domains} domainId={domainId} label={label} check={check} onDomainChange={setDomainId} onLabelChange={setLabel} idPrefix="change-host" />
        <p className="small muted">
          The domain must already point at this server (a <span className="mono">*</span> record covers every new subdomain). If the app knows its own
          address (for example SHOPIFY_APP_URL), RenVer updates it for you; redeploy afterwards so the app uses it.
        </p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" disabled={isBusy} onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={check.state !== "available" || isBusy} onClick={() => void change()}>
            {isBusy ? "Changing…" : "Change address"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
