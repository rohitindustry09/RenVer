"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";

interface Props {
  detected: string[];
  configured: string | null;
  onSaved: () => void;
}

export function ServerIpCard({ detected, configured, onSaved }: Props) {
  const [ip, setIp] = useState(configured ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);
    try {
      await api("/api/settings/server-ip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      setMessage({ ok: true, text: ip.trim() ? "Saved." : "Cleared. Using the detected address." });
      onSaved();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save} aria-labelledby="server-ip-heading">
      <div className="card-head">
        <h2 className="h3" id="server-ip-heading">Server IP address</h2>
        <p className="sub">
          The address your domains should point to. On a cloud server this is the public IP in your provider&apos;s dashboard,
          which can differ from the address this machine sees.
        </p>
      </div>
      <div className="card-pad stack-sm">
        <label className="field">
          <span className="label">Public IP</span>
          <input
            className="input mono"
            value={ip}
            placeholder={detected[0] ?? "203.0.113.10"}
            onChange={(e) => setIp(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="hint">
            Detected on this machine: {detected.length > 0 ? <span className="mono">{detected.join(", ")}</span> : "nothing"}
          </span>
        </label>
        {message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>}
      </div>
      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="btn sm" disabled={isBusy}>{isBusy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
