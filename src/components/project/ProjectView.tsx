"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FrameworkIcon } from "@/components/FrameworkIcon";
import { ProjectPageSkeleton } from "@/components/Skeleton";
import { useFetch } from "@/hooks/useFetch";
import { stackOf } from "@/lib/stack";
import { api } from "@/lib/client-api";
import { hostUrl } from "@/lib/domain-names";
import { isBusyStatus, statusLabel } from "@/lib/format";
import { DeploymentsTab } from "./DeploymentsTab";
import { OverviewTab } from "./OverviewTab";
import { RuntimeTab } from "./RuntimeTab";
import { SettingsTab } from "./SettingsTab";
import { PROJECT_TABS, type ProjectDetail, type ProjectTab } from "./types";

const REFRESH_MS = 4000;

function parseTab(value: string | null): ProjectTab {
  return PROJECT_TABS.some((t) => t.id === value) ? (value as ProjectTab) : "overview";
}

export function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { data, error, reload } = useFetch<ProjectDetail>(`/api/projects/${id}`, REFRESH_MS);

  const [tab, setTab] = useState<ProjectTab>(parseTab(search.get("tab")));
  const [activeDeploy, setActiveDeploy] = useState<string | null>(search.get("deploy"));
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRedeploying, setIsRedeploying] = useState(false);

  if (error && !data) {
    return (
      <div className="stack">
        <p className="notice error" role="alert">{error}</p>
        <Link className="btn" href="/">Back to Overview</Link>
      </div>
    );
  }
  if (!data) return <ProjectPageSkeleton />;

  const { project } = data;
  const host = project.primaryHost;
  const url = hostUrl(host);
  const isLive = project.status === "running";

  const openDeploy = (deployId: string) => {
    setActiveDeploy(deployId);
    setTab("deployments");
  };

  const redeploy = async (fromDeployId?: string) => {
    setIsRedeploying(true);
    setActionError(null);
    try {
      const result = await api<{ deployId: string }>(`/api/projects/${project.id}/redeploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployId: fromDeployId }),
      });
      await reload();
      openDeploy(result.deployId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not redeploy.");
    } finally {
      setIsRedeploying(false);
    }
  };

  return (
    <>
      <Link href="/" className="back-link">← Overview</Link>
      <div className="project-head">
        <div className="top">
          <div className="project-icon"><FrameworkIcon stack={stackOf(project.config)} size={28} fallback={project.name} /></div>
          <div style={{ minWidth: 0 }}>
            <h1 className="h1" style={{ overflowWrap: "anywhere" }}>{project.name}</h1>
            <span className="status" style={{ marginTop: 4 }}>
              <span className={`dot ${project.status}${isBusyStatus(project.status) ? " pulse" : ""}`} aria-hidden="true" />
              {statusLabel(project.status)}
            </span>
          </div>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" disabled={isRedeploying || project.status === "deploying"} onClick={() => void redeploy()}>
            {isRedeploying ? "Starting…" : "Redeploy"}
          </button>
          {isLive ? (
            <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">Visit</a>
          ) : (
            <button type="button" className="btn primary" disabled>Visit</button>
          )}
        </div>
      </div>
      {actionError && <p className="notice error" role="alert" style={{ marginBottom: 16 }}>{actionError}</p>}

      <div className="subtabs" role="tablist" aria-label="Project sections">
        {PROJECT_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" className="subtab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab detail={data} url={url} host={host} onOpenDeploy={openDeploy} />}
      {tab === "runtime" && <RuntimeTab project={project} onChanged={() => void reload()} />}
      {tab === "deployments" && (
        <DeploymentsTab
          deploys={data.deploys}
          activeId={activeDeploy}
          onToggle={setActiveDeploy}
          onRollback={redeploy}
          isBusy={isRedeploying || project.status === "deploying"}
        />
      )}
      {tab === "settings" && <SettingsTab detail={data} onRedeploy={redeploy} onChanged={reload} />}
    </>
  );
}
