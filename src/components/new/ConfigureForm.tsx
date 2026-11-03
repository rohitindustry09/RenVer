"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { HostPicker } from "@/components/domains/HostPicker";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { stackLabel } from "@/lib/stack";
import { isUsable, type DomainsPayload } from "@/components/domains/types";
import { useFetch } from "@/hooks/useFetch";
import { useHostCheck } from "@/hooks/useHostCheck";
import type { PublicProject } from "@/lib/api";
import { api } from "@/lib/client-api";
import { draftFromDetection, draftToPayload, type ConfigDraft } from "@/lib/config-draft";
import { hostUrl } from "@/lib/domain-names";
import { rowsToEnv, type EnvRow } from "@/lib/env-text";
import { suggestSubdomain } from "@/lib/subdomain";
import type { AnalyzedUpload } from "@/lib/uploads";
import { BuildSettings } from "./BuildSettings";
import { DeployProgress } from "./DeployProgress";
import { EnvEditor } from "./EnvEditor";

interface Started {
  deployId: string;
  projectId: string;
  host: string;
}

const EMPTY_ENV: EnvRow[] = [{ key: "", value: "" }];

function defaultName(upload: AnalyzedUpload): string {
  const label = upload.source.label;
  return upload.source.source === "github" ? (label.split("/")[1] ?? label) : label.replace(/\.zip$/i, "");
}

function SourceCard({ upload }: { upload: AnalyzedUpload }) {
  const { detection, source } = upload;
  return (
    <aside className="card source-card" aria-label="Source">
      <div className="kv">
        <span className="k">{source.source === "github" ? "Importing from GitHub" : "Uploaded ZIP"}</span>
        <span className="v mono">{source.label}</span>
      </div>
      {source.branch && (
        <div className="kv"><span className="k">Branch</span><span className="v mono">{source.branch}</span></div>
      )}
      <div className="kv">
        <span className="k">Framework</span>
        <span className="v" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FrameworkIcon stack={detection.stack} size={18} />
          {stackLabel(detection.stack)}
          <span className={`badge${detection.confidence === "low" ? " warn" : ""}`}>{detection.confidence} confidence</span>
        </span>
      </div>
      <div className="kv"><span className="k">Type</span><span className="v">{detection.kind === "static" ? "Static site" : "Server app"}</span></div>
      <div className="kv"><span className="k">Package manager</span><span className="v">{detection.packageManager}</span></div>
      <div className="kv"><span className="k">Node.js</span><span className="v">{detection.nodeVersion}</span></div>
      {detection.notes.map((note) => (
        <p className="notice warn small" key={note}>{note}</p>
      ))}
    </aside>
  );
}

export function ConfigureForm() {
  const uploadId = useSearchParams().get("upload");
  const { data: domainData, error: domainError, reload: reloadDomains } = useFetch<DomainsPayload>("/api/domains");

  const [upload, setUpload] = useState<AnalyzedUpload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [domainId, setDomainId] = useState("");
  const [label, setLabel] = useState("");
  const [isLabelEdited, setIsLabelEdited] = useState(false);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [envRows, setEnvRows] = useState<EnvRow[]>(EMPTY_ENV);
  const [started, setStarted] = useState<Started | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!uploadId) {
      setLoadError("No project was selected.");
      return;
    }
    api<AnalyzedUpload>(`/api/uploads/${uploadId}`)
      .then((loaded) => {
        const initial = defaultName(loaded);
        setUpload(loaded);
        setName(initial);
        setLabel(suggestSubdomain(initial));
        setDraft(draftFromDetection(loaded.detection));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not load the project."));
  }, [uploadId]);

  // Pick the first verified domain once the list arrives.
  useEffect(() => {
    if (domainId || !domainData) return;
    const first = domainData.domains.find(isUsable);
    if (first) setDomainId(first.id);
  }, [domainData, domainId]);

  const check = useHostCheck(domainId, label);
  const env = useMemo(() => rowsToEnv(envRows), [envRows]);

  if (loadError) {
    return (
      <div className="stack">
        <p className="notice error" role="alert">{loadError}</p>
        <Link className="btn" href="/new">Start over</Link>
      </div>
    );
  }
  if (domainError && !domainData) {
    return (
      <div className="stack">
        <p className="notice error" role="alert">Could not load your domains: {domainError}</p>
        <button type="button" className="btn" onClick={() => void reloadDomains()}>Try again</button>
      </div>
    );
  }
  if (!upload || !draft || !domainData) return <p className="muted">Loading project…</p>;

  const canDeploy = name.trim() !== "" && check.state === "available" && env.error === null && !isSubmitting;

  const handleName = (value: string) => {
    setName(value);
    if (!isLabelEdited) setLabel(suggestSubdomain(value));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<{ project: PublicProject; deployId: string }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, name, domainId, label, env: env.env, config: draftToPayload(draft) }),
      });
      setStarted({ deployId: result.deployId, projectId: result.project.id, host: result.project.primaryHost });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not start the deploy.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Link href="/new" className="back-link">← Back</Link>
      <div className="page-head">
        <div className="stack-sm">
          <h1 className="h1">New Project</h1>
          <p className="sub">Review the settings, then deploy.</p>
        </div>
      </div>
      <div className="split">
        <SourceCard upload={upload} />
        {started ? (
          <DeployProgress
            deployId={started.deployId}
            projectId={started.projectId}
            url={hostUrl(started.host)}
            onBack={() => setStarted(null)}
          />
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <section className="card" aria-labelledby="project-heading">
              <div className="card-head"><h2 className="h3" id="project-heading">Project</h2></div>
              <div className="card-pad stack">
                <label className="field">
                  <span className="label">Project name</span>
                  <input className="input" value={name} onChange={(e) => handleName(e.target.value)} required maxLength={80} />
                </label>
                <div className="field">
                  <span className="label">Domain</span>
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
                  <span className="hint">You can add more addresses to this project later, from its Settings.</span>
                </div>
              </div>
            </section>

            <details className="accordion">
              <summary>Build and Output Settings</summary>
              <div className="body">
                <BuildSettings detection={upload.detection} draft={draft} onChange={setDraft} />
              </div>
            </details>

            <details className="accordion" open={envRows.some((r) => r.key || r.value)}>
              <summary>Environment Variables</summary>
              <div className="body">
                <EnvEditor rows={envRows} onChange={setEnvRows} />
                {env.error && <p className="notice error" role="alert">{env.error}</p>}
              </div>
            </details>

            {submitError && <p className="notice error" role="alert">{submitError}</p>}
            <button type="submit" className="btn primary" style={{ height: 48 }} disabled={!canDeploy}>
              {isSubmitting ? "Starting…" : "Deploy"}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
