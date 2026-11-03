"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogPanel } from "./LogPanel";
import { useInstaller } from "@/hooks/useInstaller";
import { missingRequirements, REQUIRED_TOOLS, useSystem, type InstallHint } from "@/hooks/useSystem";
import type { CheckResult } from "@/lib/preflight";
import { SETUP_COOKIE } from "@/lib/setup-gate";

const REQUIREMENT_COPY: Record<string, { title: string; description: string }> = {
  docker: { title: "Docker", description: "Builds and runs every app in an isolated container." },
  caddy: { title: "Caddy", description: "Routes each subdomain to its app and issues HTTPS." },
  git: { title: "Git", description: "Clones projects from GitHub." },
  node: { title: "Node.js", description: "Runs the RenVer panel itself." },
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function markSetupDone(): void {
  document.cookie = `${SETUP_COOKIE}=1; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

interface RequirementRowProps {
  check: CheckResult;
  hint: InstallHint | undefined;
  isInstalling: boolean;
  isBusy: boolean;
  onInstall: (check: CheckResult, hint: InstallHint) => void;
}

function RequirementRow({ check, hint, isInstalling, isBusy, onInstall }: RequirementRowProps) {
  const copy = REQUIREMENT_COPY[check.id];
  const canInstall = check.status === "missing" && check.fixable && hint?.available;
  return (
    <li className="row">
      <span className={`dot ${check.status}`} aria-hidden="true" />
      <div className="row-main">
        <div className="row-title">{copy?.title ?? check.label}</div>
        <div className="row-desc">{check.status === "ok" ? check.message : `${copy?.description ?? ""} ${check.message}`.trim()}</div>
        {check.status === "missing" && hint && !hint.available && (
          <div className="row-desc" style={{ color: "var(--warning)" }}>{hint.text}</div>
        )}
      </div>
      <div className="row-end">
        {check.status === "ok" && <span className="badge">Installed</span>}
        {canInstall && (
          <button type="button" className="btn sm primary" disabled={isBusy} onClick={() => onInstall(check, hint)}>
            {isInstalling ? "Installing…" : "Install"}
          </button>
        )}
      </div>
    </li>
  );
}

export function SetupChecklist() {
  const router = useRouter();
  const { data, error, isLoading, reload } = useSystem();
  const installer = useInstaller(() => reload(true));

  const requirements = REQUIRED_TOOLS.map((id) => data?.checks.find((c) => c.id === id)).filter(
    (c): c is CheckResult => c !== undefined,
  );
  const environment = (data?.checks ?? []).filter((c) => !(REQUIRED_TOOLS as readonly string[]).includes(c.id));
  const missing = missingRequirements(data);
  const isReady = data !== null && missing.length === 0;

  const [pendingInstall, setPendingInstall] = useState<{ check: CheckResult; hint: InstallHint } | null>(null);

  const handleInstall = (check: CheckResult, hint: InstallHint) => setPendingInstall({ check, hint });

  const confirmInstall = () => {
    if (pendingInstall) void installer.start(pendingInstall.check.id);
    setPendingInstall(null);
  };

  const handleContinue = () => {
    markSetupDone();
    router.push("/");
  };

  if (!data) {
    return (
      <div className="card card-pad">
        {error ? <p className="notice error">{error}</p> : <p className="muted">Checking this machine…</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      {pendingInstall && (
        <ConfirmDialog
          title={`Install ${pendingInstall.check.label}?`}
          message={<>This will run <span className="mono">{pendingInstall.hint.text}</span> on this machine.</>}
          confirmLabel="Install"
          onConfirm={confirmInstall}
          onCancel={() => setPendingInstall(null)}
        />
      )}
      <section className="card" aria-labelledby="req-heading">
        <div className="card-head">
          <h2 className="h3" id="req-heading">Requirements</h2>
          <p className="sub">RenVer needs these four tools to build and host your apps.</p>
        </div>
        <ul className="rows">
          {requirements.map((check) => (
            <RequirementRow
              key={check.id}
              check={check}
              hint={data.installHints[check.id]}
              isInstalling={installer.installing === check.id}
              isBusy={installer.installing !== null}
              onInstall={handleInstall}
            />
          ))}
        </ul>
        {(installer.installing || installer.log) && (
          <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="status" style={{ marginBottom: 12 }} role="status">
              <span className={`dot ${installer.result === "failed" ? "fail" : installer.result === "done" ? "ok" : "building pulse"}`} />
              {installer.result === "done" ? "Install finished" : installer.result === "failed" ? "Install failed" : "Installing"}
            </div>
            <LogPanel text={installer.log} ariaLabel="Install log" emptyText="Starting…" />
          </div>
        )}
        {installer.error && <p className="notice error" style={{ margin: 16 }}>{installer.error}</p>}
      </section>

      <section className="card" aria-labelledby="env-heading">
        <div className="card-head">
          <h2 className="h3" id="env-heading">This machine</h2>
        </div>
        <ul className="rows">
          {environment.map((check) => (
            <li className="row" key={check.id}>
              <span className={`dot ${check.status}`} aria-hidden="true" />
              <div className="row-main">
                <div className="row-title">{check.label}</div>
                <div className="row-desc">{check.message}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" disabled={isLoading || installer.installing !== null} onClick={() => reload(true)}>
          {isLoading ? "Checking…" : "Re-check"}
        </button>
        <div className="toolbar">
          {!isReady && (
            <button type="button" className="btn ghost" onClick={handleContinue}>
              Skip for now
            </button>
          )}
          <button type="button" className="btn primary" disabled={!isReady} onClick={handleContinue}>
            Continue to dashboard
          </button>
        </div>
      </div>
      {!isReady && (
        <p className="sub">
          {missing.length} requirement{missing.length === 1 ? "" : "s"} left: {missing.map((c) => c.label).join(", ")}.
        </p>
      )}
    </div>
  );
}
