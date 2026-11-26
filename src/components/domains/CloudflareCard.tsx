"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { ConfirmDialog } from "../ConfirmDialog";
import type { CloudflareStatus } from "./types";

interface Props {
  status: CloudflareStatus;
  onChanged: () => void;
}

const TOKEN_STEPS = [
  <>In Cloudflare, open <strong>My Profile → API Tokens → Create Token → Create Custom Token</strong>.</>,
  <>Add an <strong>Account</strong> policy with <strong>Cloudflare Tunnel → Edit</strong>.</>,
  <>Add a <strong>Zone</strong> policy for your domain with <strong>DNS → Edit</strong> and <strong>Zone → Read</strong>.</>,
  <>Create the token and paste it below. It is shown only once.</>,
];

type Tone = "ok" | "warn" | "fail";

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
    </svg>
  );
}

function tunnelState(status: CloudflareStatus): { tone: Tone; title: string; text: string } {
  if (status.error) return { tone: "fail", title: "Tunnel problem", text: status.error };
  if (!status.tunnel) return { tone: "warn", title: "Token saved", text: "Press “Use Cloudflare” on a domain below to create the tunnel." };
  if (status.connected) return { tone: "ok", title: "Tunnel connected", text: "Addresses on your Cloudflare domains are served from this computer." };
  if (status.running) return { tone: "warn", title: "Tunnel starting", text: "It should connect in a few seconds." };
  return { tone: "warn", title: "Tunnel not running", text: "It starts again when the panel restarts, or press “Use Cloudflare” on a domain." };
}

/** Serve your own domains from this computer through a Cloudflare tunnel: no router settings, no open ports. */
export function CloudflareCard({ status, onChanged }: Props) {
  const [token, setToken] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const run = async (task: () => Promise<string>) => {
    setIsBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setIsBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/api/settings/cloudflare", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setToken("");
      return "Token saved. Now press “Use Cloudflare” on the domain you want to serve.";
    });
  };

  const disconnect = () => {
    setIsConfirmingRemove(false);
    void run(async () => {
      const result = await api<{ problems: string[] }>("/api/settings/cloudflare", { method: "DELETE" });
      return result.problems.length > 0
        ? `Disconnected. Some things could not be removed in Cloudflare, so check its DNS page: ${result.problems.join("; ")}`
        : "Disconnected. The tunnel and the DNS records RenVer made were removed.";
    });
  };

  const state = tunnelState(status);
  const hasDomain = status.domainIds.length > 0;
  const steps: { title: string; text: string; state: "done" | "current" | "todo" }[] = [
    { title: "Save your token", text: "Lets RenVer manage the tunnel.", state: status.hasToken ? "done" : "current" },
    { title: "Connect a domain", text: "Press “Use Cloudflare” on it below.", state: hasDomain ? "done" : status.hasToken ? "current" : "todo" },
    { title: "Add an address", text: "Give a project a subdomain.", state: hasDomain ? "current" : "todo" },
  ];
  const notice = message && <p className={`notice${message.ok ? "" : " error"}`} role="status">{message.text}</p>;

  return (
    <section className="card" aria-labelledby="cloudflare-heading">
      {isConfirmingRemove && (
        <ConfirmDialog
          title="Disconnect Cloudflare?"
          message="This stops the tunnel and removes the tunnel and the DNS records RenVer created in Cloudflare. Your domains stay in RenVer, but their addresses stop working until you reconnect."
          confirmLabel="Disconnect"
          busyLabel="Disconnecting…"
          tone="danger"
          isBusy={isBusy}
          onConfirm={disconnect}
          onCancel={() => setIsConfirmingRemove(false)}
        />
      )}
      <div className="card-head">
        <h2 className="h3" id="cloudflare-heading">Serve through Cloudflare</h2>
        <p className="sub">
          Puts your domain&apos;s subdomains online from this computer, with HTTPS, without touching your router or opening ports.
          Needs a free Cloudflare account with your domain added to it.
        </p>
      </div>

      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <ol className="steps" aria-label="Setup progress">
          {steps.map((step, index) => (
            <li className="step" key={step.title} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
              <span className="step-num" aria-hidden="true">{step.state === "done" ? <CheckIcon /> : index + 1}</span>
              <div>
                <div className="step-title">{step.title}</div>
                <div className="step-text">{step.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {status.hasToken ? (
        <>
          <div className="card-pad stack-sm">
            <div className="status-line">
              <span className={`dot ${state.tone}${state.tone === "warn" && status.running ? " pulse" : ""}`} aria-hidden="true" />
              <div>
                <div className="row-title">{state.title}</div>
                <div className="row-desc">{state.text}</div>
              </div>
            </div>
            {notice}
          </div>
          <div className="card-foot" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn sm danger" disabled={isBusy} onClick={() => setIsConfirmingRemove(true)}>
              Disconnect Cloudflare
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={save}>
          <div className="card-pad stack">
            <ol className="stack-sm" style={{ paddingLeft: 20 }}>
              {TOKEN_STEPS.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
            <label className="field">
              <span className="label">API token</span>
              <input
                className="input mono"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the token here"
              />
              <span className="hint">Stored encrypted on this computer and never shown again.</span>
            </label>
            {notice}
          </div>
          <div className="card-foot" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn primary sm" disabled={isBusy || token.trim() === ""}>
              {isBusy ? "Checking…" : "Save token"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
