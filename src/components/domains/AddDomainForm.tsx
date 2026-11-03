"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { validateDomainName } from "@/lib/domain-names";

interface Props {
  onAdded: () => void;
  onCancel: () => void;
}

export function AddDomainForm({ onAdded, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const check = name.trim() ? validateDomainName(name) : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    try {
      await api("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the domain.");
      setIsBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="card-head">
        <h2 className="h3">Add a domain</h2>
        <p className="sub">
          Use a domain you own, like <span className="mono">example.com</span>. You will prove ownership with a DNS record, then
          put projects on its subdomains or on the domain itself.
        </p>
      </div>
      <div className="card-pad stack-sm">
        <label className="field">
          <span className="label">Domain</span>
          <input
            className="input mono"
            value={name}
            placeholder="example.com"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          {check && !check.ok && <span className="hint" style={{ color: "var(--error)" }}>{check.error}</span>}
          {check?.ok && check.value !== name.trim().toLowerCase() && (
            <span className="hint">Will be added as <span className="mono">{check.value}</span></span>
          )}
        </label>
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
      <div className="card-foot">
        <span className="small muted">
          <span className="mono">localhost</span> and <span className="mono">*.localhost</span> are for local testing and need no proof.
        </span>
        <div className="toolbar">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={isBusy || !check?.ok}>
            {isBusy ? "Adding…" : "Add domain"}
          </button>
        </div>
      </div>
    </form>
  );
}
