"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { HostPicker } from "@/components/domains/HostPicker";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { Select } from "@/components/Select";
import { isUsable, type DomainsPayload } from "@/components/domains/types";
import { useFetch } from "@/hooks/useFetch";
import { useHostCheck } from "@/hooks/useHostCheck";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { hostUrl } from "@/lib/domain-names";
import { suggestSubdomain } from "@/lib/subdomain";
import { generateAdminPassword, WP_LANGUAGES } from "@/lib/wordpress-input";
import { DeployProgress } from "./DeployProgress";

interface Started {
  deployId: string;
  projectId: string;
  host: string;
  adminUser: string;
}

const randomBelow = (below: number): number => {
  const limit = Math.floor(0x100000000 / below) * below;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % below;
};

export function WordPressForm() {
  const { data: domainData, error: domainError, reload: reloadDomains } = useFetch<DomainsPayload>("/api/domains");
  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState("");
  const [label, setLabel] = useState("");
  const [isLabelEdited, setIsLabelEdited] = useState(false);
  const [adminUser, setAdminUser] = useState("admin");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isShown, setIsShown] = useState(false);
  const [language, setLanguage] = useState("en_US");
  const [indexable, setIndexable] = useState(true);
  const [started, setStarted] = useState<Started | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (domainId || !domainData) return;
    const first = domainData.domains.find(isUsable);
    if (first) setDomainId(first.id);
  }, [domainData, domainId]);

  const check = useHostCheck(domainId, label);

  if (domainError && !domainData) {
    return (
      <div className="stack">
        <p className="notice error" role="alert">Could not load your domains: {domainError}</p>
        <button type="button" className="btn" onClick={() => void reloadDomains()}>Try again</button>
      </div>
    );
  }
  if (!domainData) return <p className="muted">Loading…</p>;

  const canCreate = title.trim() !== "" && adminEmail.trim() !== "" && adminPassword !== "" && check.state === "available" && !isSubmitting;

  const handleTitle = (value: string) => {
    setTitle(value);
    if (!isLabelEdited) setLabel(suggestSubdomain(value));
  };

  const handleGenerate = () => {
    setAdminPassword(generateAdminPassword(randomBelow));
    setIsShown(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<{ project: PublicProject; deployId: string }>("/api/websites/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, domainId, label, adminUser, adminEmail, adminPassword, language, indexable }),
      });
      setStarted({ deployId: result.deployId, projectId: result.project.id, host: result.project.primaryHost, adminUser });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create the website.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Link href="/new" className="back-link">← Back</Link>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FrameworkIcon stack="wordpress" size={28} /> New WordPress website
          </h1>
          <p className="sub">RenVer sets up WordPress, its database and your admin account. No installer screens.</p>
        </div>
      </div>

      {started ? (
        <DeployProgress
          deployId={started.deployId}
          projectId={started.projectId}
          url={hostUrl(started.host)}
          adminUrl={`${hostUrl(started.host)}/wp-admin/`}
          adminUser={started.adminUser}
          onBack={() => setStarted(null)}
        />
      ) : (
        <form className="stack" onSubmit={handleSubmit}>
          <section className="card" aria-labelledby="site-heading">
            <div className="card-head"><h2 className="h3" id="site-heading">Website</h2></div>
            <div className="card-pad stack">
              <label className="field">
                <span className="label">Website title</span>
                <input className="input" value={title} onChange={(e) => handleTitle(e.target.value)} required maxLength={80} />
              </label>
              <div className="field">
                <span className="label">Address</span>
                <HostPicker
                  domains={domainData.domains}
                  domainId={domainId}
                  label={label}
                  check={check}
                  onDomainChange={setDomainId}
                  onLabelChange={(value) => {
                    setIsLabelEdited(true);
                    setLabel(value);
                  }}
                />
              </div>
              <div className="field">
                <span className="label">Language</span>
                <Select value={language} onChange={setLanguage} ariaLabel="Language" options={WP_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
              </div>
              <label className="field" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={!indexable} onChange={(e) => setIndexable(!e.target.checked)} />
                <span>Ask search engines not to list this website yet</span>
              </label>
            </div>
          </section>

          <section className="card" aria-labelledby="admin-heading">
            <div className="card-head"><h2 className="h3" id="admin-heading">Admin account</h2></div>
            <div className="card-pad stack">
              <label className="field">
                <span className="label">Username</span>
                <input className="input mono" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} required autoComplete="off" spellCheck={false} />
              </label>
              <label className="field">
                <span className="label">Email</span>
                <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required autoComplete="off" />
              </label>
              <div className="field">
                <label className="label" htmlFor="wp-password">Password</label>
                <div className="input-group">
                  <input
                    id="wp-password"
                    className="input mono"
                    type={isShown ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button type="button" className="btn" onClick={() => setIsShown((v) => !v)}>{isShown ? "Hide" : "Show"}</button>
                  <button type="button" className="btn" onClick={handleGenerate}>Generate</button>
                </div>
                <span className="hint">At least 12 characters. Save it now: RenVer does not keep it after the website is set up.</span>
              </div>
            </div>
          </section>

          {submitError && <p className="notice error" role="alert">{submitError}</p>}
          <button type="submit" className="btn primary" style={{ height: 48 }} disabled={!canCreate}>
            {isSubmitting ? "Creating…" : "Create website"}
          </button>
        </form>
      )}
    </>
  );
}
