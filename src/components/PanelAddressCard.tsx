"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";

interface Props {
  host: string;
  verifiedDomains: string[];
  onSaved: () => void;
}

/** Where the panel itself is opened: its own web address (HTTPS through Caddy), or none to keep it private. */
export function PanelAddressCard({ host, verifiedDomains, onSaved }: Props) {
  const [value, setValue] = useState(host);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async (next: string) => {
    setIsBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await api<{ host: string; applied: boolean }>("/api/settings/panel-host", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: next }),
      });
      setValue(result.host);
      setSaved(
        result.host === ""
          ? "The panel has no web address now. Open it by the server's IP and port, or through an SSH tunnel."
          : result.applied
            ? `Saved. The panel is served at https://${result.host}. The first visit takes a few seconds while the HTTPS certificate is made.`
            : `Saved, but the proxy (Caddy) could not be updated yet. Check that Caddy is running, then save again.`,
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setIsBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save(value);
  };

  const example = verifiedDomains[0] ? `panel.${verifiedDomains[0]}` : "panel.example.com";

  return (
    <section className="card" aria-labelledby="panel-address-heading">
      <div className="card-head"><h2 className="h3" id="panel-address-heading">Panel address</h2></div>
      <form className="card-pad stack-sm" onSubmit={submit}>
        {verifiedDomains.length === 0 ? (
          <p className="notice warn" role="status">
            Add and verify a domain on the <Link href="/domains">Domains page</Link> first. The panel can only be served on a domain you own.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="label">Web address of this panel</span>
              <input
                className="input mono"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={example}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="panel-address-hint"
              />
            </label>
            <p className="small muted" id="panel-address-hint">
              Needs a DNS record for this name pointing at the server (the <span className="mono">*</span> record on the Domains page covers it) and ports 80 and 443 open. Leave it empty to keep the panel private. Changes apply at once, with no restart.
            </p>
          </>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {saved && <p className="notice" role="status">{saved}</p>}
      </form>
      {verifiedDomains.length > 0 && (
        <div className="card-foot" style={{ justifyContent: "flex-end", gap: 8 }}>
          {host && (
            <button type="button" className="btn" disabled={isBusy} onClick={() => void save("")}>Keep private</button>
          )}
          <button type="button" className="btn primary" disabled={isBusy || value.trim() === host} onClick={() => void save(value)}>
            {isBusy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </section>
  );
}
