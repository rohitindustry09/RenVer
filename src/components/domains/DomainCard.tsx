"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { CHALLENGE_LABEL, hostUrl } from "@/lib/domain-names";
import { ConfirmDelete } from "../ConfirmDelete";
import { CopyButton } from "../CopyButton";
import type { DomainItem } from "./types";

interface Props {
  domain: DomainItem;
  /** The IP address to show in A records. */
  serverIp: string;
  onChanged: () => void;
}

interface VerifyResult {
  verified: boolean;
  message: string;
}

interface DnsCheck {
  name: string;
  addresses: string[];
  status: "ok" | "warn" | "fail";
  message: string;
}

function RecordRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <tr>
      <td>{type}</td>
      <td>
        {name} <CopyButton text={name} label="Copy" />
      </td>
      <td style={{ overflowWrap: "anywhere" }}>
        {value} <CopyButton text={value} label="Copy" />
      </td>
    </tr>
  );
}

export function DomainCard({ domain, serverIp, onChanged }: Props) {
  const [busy, setBusy] = useState<"verify" | "check" | "remove" | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [dnsResult, setDnsResult] = useState<{ root: DnsCheck; wildcard: DnsCheck } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const isPending = domain.status === "pending";
  const inUse = domain.hosts.length > 0;

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const verify = () =>
    run("verify", async () => {
      const result = await api<VerifyResult>(`/api/domains/${domain.id}/verify`, { method: "POST" });
      setVerifyResult(result);
      if (result.verified) onChanged();
    });

  const checkDns = () =>
    run("check", async () => setDnsResult(await api(`/api/domains/${domain.id}/check`, { method: "POST" })));

  const remove = async () => {
    await run("remove", async () => {
      await api(`/api/domains/${domain.id}`, { method: "DELETE" });
      onChanged();
    });
    setIsConfirmingRemove(false);
  };

  return (
    <section className="card" aria-label={`Domain ${domain.name}`}>
      <div className="row">
        <span className={`dot ${isPending ? "warn" : "ok"}`} aria-hidden="true" />
        <div className="row-main">
          <div className="row-title mono">{domain.name}</div>
          <div className="row-desc">
            {isPending
              ? "Waiting for ownership verification"
              : domain.isLocal
                ? "Local domain: resolved by your browser, no DNS needed"
                : "Verified"}
            {" · "}
            {domain.hosts.length} {domain.hosts.length === 1 ? "address" : "addresses"} in use
          </div>
        </div>
        <div className="row-end">
          <span className={`badge${isPending ? " warn" : ""}`}>{isPending ? "Pending" : domain.isLocal ? "Local" : "Verified"}</span>
          <button
            type="button"
            className="btn sm danger"
            disabled={inUse || busy !== null || isConfirmingRemove}
            title={inUse ? "Remove its addresses first" : undefined}
            onClick={() => setIsConfirmingRemove(true)}
          >
            Remove
          </button>
        </div>
      </div>

      {isConfirmingRemove && (
        <ConfirmDelete
          title="Remove domain"
          phrase={domain.name}
          message="This removes the domain from RenVer. Your DNS records are not touched."
          actionLabel="Remove domain"
          busyLabel="Removing…"
          isBusy={busy === "remove"}
          onConfirm={remove}
          onCancel={() => setIsConfirmingRemove(false)}
        />
      )}

      {isPending && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="card-pad stack-sm">
            <h3 className="h3">Prove you own this domain</h3>
            <p className="sub">
              Add this TXT record at your DNS provider. RenVer only lets you use domains it can see this record on, so nobody
              can point a domain they don&apos;t control at this server. You can delete the record afterwards.
            </p>
          </div>
          <table className="dns-table" aria-label="Ownership record">
            <thead><tr><th>Type</th><th>Name / host</th><th>Value</th></tr></thead>
            <tbody>
              <RecordRow type="TXT" name={CHALLENGE_LABEL} value={domain.txt.value} />
            </tbody>
          </table>
          <p className="small muted" style={{ padding: "8px 24px 16px" }}>Full name: <span className="mono">{domain.txt.name}</span></p>
        </div>
      )}

      {!isPending && !domain.isLocal && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <table className="dns-table" aria-label="DNS records to add">
            <thead><tr><th>Type</th><th>Name / host</th><th>Value</th></tr></thead>
            <tbody>
              <RecordRow type="A" name="*" value={serverIp} />
              <RecordRow type="A" name="@" value={serverIp} />
            </tbody>
          </table>
          <p className="small muted" style={{ padding: "8px 24px 4px" }}>
            <span className="mono">*</span> is all you need for apps on subdomains such as <span className="mono">app.{domain.name}</span>. Subdomains that already have their own record (like <span className="mono">www</span>) keep working as they are.
          </p>
          <p className="small muted" style={{ padding: "0 24px 16px" }}>
            <strong>Optional:</strong> <span className="mono">@</span> is the main domain itself (<span className="mono">{domain.name}</span>). Add it only if an app should open on the main domain. <strong>If {domain.name} already hosts a website, do not add it: it would take that site offline.</strong>
          </p>
        </div>
      )}

      {domain.hosts.length > 0 && (
        <div className="card-pad stack-sm" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="small muted">Addresses using this domain</span>
          <ul className="rows" style={{ listStyle: "none" }}>
            {domain.hosts.map((host) => (
              <li key={host} className="mono" style={{ padding: "4px 0" }}>
                <a href={hostUrl(host)} target="_blank" rel="noopener noreferrer">{host}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {verifyResult && (
        <p className={`notice${verifyResult.verified ? "" : " warn"}`} style={{ margin: "0 24px 16px" }} role="status">
          {verifyResult.message}
        </p>
      )}
      {dnsResult && (
        <div className="stack-sm" style={{ padding: "0 24px 16px" }}>
          {[dnsResult.wildcard, dnsResult.root].map((check) => {
            // The main domain is optional: pointing elsewhere is normal, so it never shows as an error.
            const isRoot = check === dnsResult.root;
            const status = isRoot && check.status !== "ok" ? "info" : check.status;
            const message = isRoot && check.status !== "ok" ? "Not pointed at this server. That is fine: the main domain is left alone." : check.message;
            return (
              <p key={check.name} className={`notice${status === "ok" || status === "info" ? "" : status === "warn" ? " warn" : " error"}`} role="status">
                <span className={`dot ${status === "ok" ? "ok" : status === "info" ? "" : status === "warn" ? "warn" : "fail"}`} style={{ marginTop: 6 }} />
                <span>
                  <span className="mono">{check.name}</span> → {check.addresses.join(", ") || "no answer"}
                  <br />
                  <span className="muted">{message}</span>
                </span>
              </p>
            );
          })}
        </div>
      )}
      {error && <p className="notice error" style={{ margin: "0 24px 16px" }} role="alert">{error}</p>}

      {(isPending || !domain.isLocal) && (
        <div className="card-foot">
          <span className="small muted">
            {isPending ? "DNS changes can take a few minutes to appear." : "Checks that the domain and its subdomains point here."}
          </span>
          {isPending ? (
            <button type="button" className="btn primary sm" disabled={busy !== null} onClick={verify}>
              {busy === "verify" ? "Checking…" : "Verify ownership"}
            </button>
          ) : (
            <button type="button" className="btn sm" disabled={busy !== null} onClick={checkDns}>
              {busy === "check" ? "Checking…" : "Check DNS"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
