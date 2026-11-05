"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { BackupsCard } from "@/components/BackupsCard";
import { CleanupCard } from "@/components/CleanupCard";
import { GithubCard } from "@/components/GithubCard";
import { NotificationsCard } from "@/components/NotificationsCard";
import { PanelAddressCard } from "@/components/PanelAddressCard";
import { ResourcesCard, type ResourceInfo } from "@/components/ResourcesCard";
import { SkeletonLines } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { applyTheme, readTheme, type ThemeChoice } from "@/lib/theme";

interface SettingsData extends ResourceInfo {
  mode: "local" | "production";
  dataDir: string;
  passwordProtected: boolean;
  adminUser: string;
  panelHost: string;
  verifiedDomains: string[];
  secretWarnings: { id: string; message: string }[];
  twoFactor: boolean;
  backupsEncrypted: boolean;
  allowedAddressesSet: boolean;
  node: string;
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <li className="row">
      <div className="row-main">
        <div className="row-title">{title}</div>
        {description && <div className="row-desc">{description}</div>}
      </div>
      <div className="row-end">{children}</div>
    </li>
  );
}

export default function SettingsPage() {
  const { data, error, reload } = useFetch<SettingsData>("/api/settings");
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => setTheme(readTheme()), []);

  /** Forgets the code step in this browser: the next page asks for a code again. */
  const lockNow = async () => {
    await api("/api/auth/lock", { method: "POST" });
    window.location.assign("/");
  };

  /** Invalidates every sign-in on every browser, this one included. */
  const signOutEverywhere = async () => {
    await api("/api/auth/signout-all", { method: "POST" });
    window.location.assign("/login");
  };

  const chooseTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    applyTheme(choice);
  };

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">Settings</h1>
          <p className="sub">How this RenVer instance is set up.</p>
        </div>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="appearance-heading">
          <div className="card-head"><h2 className="h3" id="appearance-heading">Appearance</h2></div>
          <ul className="rows">
            <Row title="Theme" description="Follows your system unless you pick one.">
              <div className="seg" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => chooseTheme(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Row>
          </ul>
        </section>

        <section className="card" aria-labelledby="general-heading">
          <div className="card-head"><h2 className="h3" id="general-heading">General</h2></div>
          {error && <p className="notice error" style={{ margin: 16 }}>{error}</p>}
          {!data && !error && <div className="card-pad"><SkeletonLines lines={3} widths={["70%", "50%", "60%"]} /></div>}
          {data && (
            <ul className="rows">
              <Row title="Mode" description="RENVER_MODE"><span className="badge">{data.mode}</span></Row>
              <Row title="First domain" description="RENVER_BASE_DOMAIN only seeds the first entry. Manage domains on the Domains page.">
                <Link className="btn sm" href="/domains">Manage domains</Link>
              </Row>
              <Row title="Data folder" description="RENVER_DATA_DIR"><span className="mono small">{data.dataDir}</span></Row>
              <Row title="Node.js"><span className="mono">{data.node}</span></Row>
            </ul>
          )}
          <div className="card-foot">
            <span className="small muted">These come from environment variables. Change them, then restart RenVer. Resource limits are below and can be edited here.</span>
          </div>
        </section>

        {data && <PanelAddressCard key={data.panelHost} host={data.panelHost} verifiedDomains={data.verifiedDomains} onSaved={reload} />}

        {data && <ResourcesCard key={JSON.stringify(data.limits)} info={data} onSaved={reload} />}

        <GithubCard />

        <BackupsCard />

        <CleanupCard />

        <NotificationsCard />

        <section className="card" aria-labelledby="security-heading">
          <div className="card-head"><h2 className="h3" id="security-heading">Security</h2></div>
          {data && data.secretWarnings.length > 0 && (
            <div className="stack-sm" style={{ padding: "16px 24px 0" }}>
              {data.secretWarnings.map((w) => <p className="notice warn" role="status" key={w.id}>{w.message}</p>)}
            </div>
          )}
          <ul className="rows">
            <Row
              title="Panel password"
              description={
                data?.passwordProtected
                  ? `Sign in with the username "${data.adminUser}" and your password. Use Sign out in the sidebar when you are done.`
                  : "Anyone who can reach this panel can deploy code. Set RENVER_ADMIN_PASSWORD before exposing it."
              }
            >
              {data && <span className={`badge${data.passwordProtected ? "" : " warn"}`}>{data.passwordProtected ? "Enabled" : "Not set"}</span>}
            </Row>
            {data?.passwordProtected && (
              <Row title="Sign out everywhere" description="Ends every sign-in on every browser and device, this one too. Use it if you think someone else has access.">
                <button type="button" className="btn sm" onClick={() => void signOutEverywhere()}>Sign out everywhere</button>
              </Row>
            )}
            <Row
              title="Two-factor login"
              description={
                data?.twoFactor
                  ? "After the password, the panel asks for a 6-digit code from your authenticator app."
                  : "Off. Run `npm run totp` on the server, add the line it prints to the settings and restart, to ask for a code after the password."
              }
            >
              {data && (
                <span className="toolbar">
                  <span className={`badge${data.twoFactor ? "" : " warn"}`}>{data.twoFactor ? "Enabled" : "Off"}</span>
                  {data.twoFactor && (
                    <button type="button" className="btn sm" onClick={() => void lockNow()}>Lock now</button>
                  )}
                </span>
              )}
            </Row>
            <Row
              title="Encrypted backups"
              description={data?.backupsEncrypted ? "New backups are encrypted with your passphrase." : "New backups are not encrypted. Set RENVER_BACKUP_PASSPHRASE."}
            >
              {data && <span className={`badge${data.backupsEncrypted ? "" : " warn"}`}>{data.backupsEncrypted ? "On" : "Off"}</span>}
            </Row>
            <Row
              title="Allowed addresses"
              description={data?.allowedAddressesSet ? "Only listed addresses can reach the panel." : "Any address can reach the panel's login. Set RENVER_ALLOWED_IPS to limit it."}
            >
              {data && <span className={`badge${data.allowedAddressesSet ? "" : " warn"}`}>{data.allowedAddressesSet ? "Limited" : "Open"}</span>}
            </Row>
          </ul>
        </section>

        <ActivityCard />

        <section className="card" aria-labelledby="setup-heading">
          <div className="card-head"><h2 className="h3" id="setup-heading">Setup</h2></div>
          <ul className="rows">
            <Row title="Requirements" description="Docker, Caddy, Git and Node.js.">
              <Link className="btn sm" href="/setup">Open setup</Link>
            </Row>
          </ul>
        </section>
      </div>
    </>
  );
}
