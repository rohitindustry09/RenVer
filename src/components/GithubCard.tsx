"use client";

import { useState, type FormEvent } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { validateGithubToken } from "@/lib/github-token";

interface Connection {
  connected: boolean;
  login: string | null;
  source: "settings" | "env" | null;
}

/** Connects RenVer to GitHub with an access token, so private repositories can be imported and deployed. */
export function GithubCard() {
  const { data, reload } = useFetch<Connection>("/api/settings/github");
  const [token, setToken] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const checked = validateGithubToken(token);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (!checked.ok) return;
    setIsBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await api<Connection>("/api/settings/github", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: checked.value }),
      });
      setToken("");
      setNote(`Connected${result.login ? ` as ${result.login}` : ""}. Private repositories you gave the token access to can now be imported.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setIsBusy(false);
    }
  };

  const disconnect = async () => {
    setIsBusy(true);
    setError(null);
    setNote(null);
    try {
      await api<Connection>("/api/settings/github", { method: "DELETE" });
      setNote("Disconnected. Private repositories can no longer be imported or updated.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="github-heading">
      <div className="card-head">
        <h2 className="h3" id="github-heading">GitHub</h2>
        {data && (
          <span className={`badge${data.connected ? " ok" : ""}`}>
            {data.connected ? (data.login ? `Connected as ${data.login}` : "Connected") : "Not connected"}
          </span>
        )}
      </div>
      <form className="card-pad stack-sm" onSubmit={connect}>
        <p className="sub">
          Private repositories cannot be cloned without permission. Connect GitHub with an access token and RenVer can import and
          update them. The token is checked with GitHub, then stored encrypted on this server, and it is never shown again.
        </p>
        {data?.source === "env" && <p className="small muted">The token comes from RENVER_GITHUB_TOKEN in the settings file. Saving one here replaces it.</p>}
        <details>
          <summary className="small" style={{ cursor: "pointer" }}>How to make a token (2 minutes)</summary>
          <ol className="small muted" style={{ paddingLeft: 20, display: "grid", gap: 4, marginTop: 8 }}>
            <li>On GitHub open Settings → Developer settings → Personal access tokens → <strong>Fine-grained tokens</strong> → Generate new token.</li>
            <li>Repository access: choose <strong>Only select repositories</strong> and pick the private repositories you deploy.</li>
            <li>Permissions → Repository permissions: set <strong>Contents</strong> to <strong>Read-only</strong>. (Metadata read-only is added for you.)</li>
            <li>Generate, copy the token (it starts with <span className="mono">github_pat_</span>) and paste it below.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 8 }}>
            Direct link:{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a>
          </p>
        </details>
        <label className="field">
          <span className="label">{data?.connected ? "Replace the token" : "Access token"}</span>
          <input
            className="input mono"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="new-password"
            spellCheck={false}
            autoCapitalize="none"
          />
        </label>
        {token !== "" && !checked.ok && <p className="notice error" role="alert">{checked.error}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {note && <p className="notice" role="status">{note}</p>}
      </form>
      <div className="card-foot" style={{ justifyContent: "flex-end", gap: 8 }}>
        {data?.source === "settings" && (
          <button type="button" className="btn danger" disabled={isBusy} onClick={() => void disconnect()}>Disconnect</button>
        )}
        <button type="button" className="btn primary" disabled={isBusy || !checked.ok} onClick={(e) => void connect(e as unknown as FormEvent)}>
          {isBusy ? "Checking with GitHub…" : data?.connected ? "Replace token" : "Connect GitHub"}
        </button>
      </div>
    </section>
  );
}
