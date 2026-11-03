"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BackupsCard } from "@/components/BackupsCard";
import { NotificationsCard } from "@/components/NotificationsCard";
import { ResourcesCard, type ResourceInfo } from "@/components/ResourcesCard";
import { SkeletonLines } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { applyTheme, readTheme, type ThemeChoice } from "@/lib/theme";

interface SettingsData extends ResourceInfo {
  mode: "local" | "production";
  dataDir: string;
  passwordProtected: boolean;
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

        {data && <ResourcesCard key={JSON.stringify(data.limits)} info={data} onSaved={reload} />}

        <BackupsCard />

        <NotificationsCard />

        <section className="card" aria-labelledby="security-heading">
          <div className="card-head"><h2 className="h3" id="security-heading">Security</h2></div>
          <ul className="rows">
            <Row
              title="Panel password"
              description={
                data?.passwordProtected
                  ? "The panel asks for a password."
                  : "Anyone who can reach this panel can deploy code. Set RENVER_ADMIN_PASSWORD before exposing it."
              }
            >
              {data && <span className={`badge${data.passwordProtected ? "" : " warn"}`}>{data.passwordProtected ? "Enabled" : "Not set"}</span>}
            </Row>
          </ul>
        </section>

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
