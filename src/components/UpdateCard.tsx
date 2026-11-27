"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { usePanelLog } from "@/hooks/usePanelLog";
import { useUpdate } from "@/hooks/useUpdate";
import { api } from "@/lib/client-api";
import { clientCache } from "@/lib/client-cache";
import { timeAgo } from "@/lib/format";
import type { UpdateCheck } from "@/lib/update-check";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogPanel } from "./LogPanel";

type LogTab = "update" | "panel";

const CHECK_URL = "/api/system/update/check";
/** The page asks the server every 30 seconds (and again whenever the tab becomes visible). */
const WATCH_MS = 30_000;
const TICK_MS = 15_000;

const STATUS: Record<string, { dot: string; title: string }> = {
  idle: { dot: "", title: "Ready" },
  running: { dot: "warn pulse", title: "Updating" },
  restarting: { dot: "warn pulse", title: "Restarting" },
  done: { dot: "ok", title: "Finished" },
  failed: { dot: "fail", title: "Failed" },
};

const STEP_LABEL: Record<string, string> = { pull: "Pulling the latest code", install: "Installing packages", build: "Building" };

/** Re-renders now and then so "checked 20s ago" stays true without asking the server. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** What GitHub has: a newer version waiting (with its commits), nothing new, or why it could not look. */
function WatchStatus({ check, isChecking, onCheck }: { check: UpdateCheck | null | undefined; isChecking: boolean; onCheck: () => void }) {
  const now = useNow();
  if (!check) {
    return (
      <div className="status-line">
        <span className="dot pulse" aria-hidden="true" />
        <div><div className="row-title">Checking GitHub…</div></div>
      </div>
    );
  }

  const hasUpdate = check.behind > 0;
  const isBroken = check.upstream === null;
  const dot = isBroken ? "warn" : hasUpdate ? "warn pulse" : check.error ? "warn" : "ok";
  const title = isBroken
    ? "Cannot check for updates"
    : hasUpdate
      ? `${plural(check.behind, "update", "updates")} available`
      : check.error
        ? "Could not check GitHub"
        : "Up to date";
  const hidden = check.behind - check.commits.length;

  return (
    <div className="stack-sm">
      <div className="status-line">
        <span className={`dot ${dot}`} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div className="row-title">{title}</div>
          <div className="row-desc">
            {check.error ?? (hasUpdate ? `GitHub has newer commits on ${check.upstream}.` : `You are on the newest commit of ${check.upstream}.`)}
            {" "}
            <span className="muted">Checked {timeAgo(new Date(check.checkedAt).toISOString(), new Date(now))}.</span>
            {check.ahead > 0 && <> This copy also has {plural(check.ahead, "commit", "commits")} that are not on GitHub.</>}
          </div>
        </div>
        <button type="button" className="btn sm" disabled={isChecking} onClick={onCheck}>
          {isChecking ? "Checking…" : "Check now"}
        </button>
      </div>
      {hasUpdate && (
        <ul className="commit-list" aria-label="New commits">
          {check.commits.map((commit) => (
            <li key={commit.commit}>
              <span className="mono small muted">{commit.commit}</span>
              <span>{commit.subject}</span>
            </li>
          ))}
          {hidden > 0 && <li className="muted small">and {plural(hidden, "more commit", "more commits")}</li>}
        </ul>
      )}
    </div>
  );
}

/** Update RenVer from GitHub: watches for new commits, then pulls, builds in a spare folder and restarts, with live logs. */
export function UpdateCard() {
  const update = useUpdate();
  const [tab, setTab] = useState<LogTab>("update");
  const [pending, setPending] = useState<"normal" | "force" | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const panelLog = usePanelLog(tab === "panel");
  const { data: check } = useFetch<UpdateCheck | null>(CHECK_URL, WATCH_MS);

  const checkNow = async () => {
    setIsChecking(true);
    try {
      clientCache.set(CHECK_URL, await api<UpdateCheck | null>(`${CHECK_URL}?force=1`));
    } catch {
      // the next scheduled check will try again
    } finally {
      setIsChecking(false);
    }
  };

  const { state } = update;
  const isUpToDate = Boolean(check && check.upstream && !check.error && check.behind === 0);
  const showJob = update.isDown || state.status !== "idle";
  const status = update.isDown ? STATUS.restarting! : (STATUS[state.status] ?? STATUS.idle!);
  const detail = update.isDown
    ? "The panel is restarting. This page reloads by itself when it is back."
    : state.status === "running"
      ? `${STEP_LABEL[state.step ?? ""] ?? "Starting"}…`
      : state.message;

  const confirm = () => {
    const force = pending === "force";
    setPending(null);
    setTab("update");
    void update.start(force);
  };

  return (
    <section className="card" aria-labelledby="update-heading">
      {pending && (
        <ConfirmDialog
          title="Update RenVer?"
          message={
            <>
              This pulls the latest code from GitHub, builds it and {update.supervised ? "restarts the panel" : "leaves it for you to restart"}. The
              build runs in a spare folder, so the panel keeps working until it is ready. If the new build cannot start, RenVer goes back to
              the previous one by itself.
            </>
          }
          confirmLabel={pending === "force" ? "Rebuild" : "Update"}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      <div className="card-head">
        <h2 className="h3" id="update-heading">Update RenVer</h2>
        <p className="sub">
          {update.version ? <>Running <span className="mono">{update.version.commit}</span> · {update.version.subject}</> : "Pull, build and restart from here."}
        </p>
      </div>

      <div className="card-pad stack-sm">
        <WatchStatus check={check} isChecking={isChecking} onCheck={() => void checkNow()} />

        {showJob && (
          <div className="status-line">
            <span className={`dot ${status.dot}`} aria-hidden="true" />
            <div>
              <div className="row-title">{status.title}</div>
              <div className="row-desc">{detail}</div>
            </div>
          </div>
        )}
        {!update.supervised && (
          <p className="notice warn" role="status">
            RenVer was not started through <span className="mono">npm start</span>, so it can build the new version but cannot restart itself. Restart
            it yourself after the build.
          </p>
        )}
        {update.error && <p className="notice error" role="alert">{update.error}</p>}

        <div className="seg" role="group" aria-label="Log">
          <button type="button" aria-pressed={tab === "update"} onClick={() => setTab("update")}>Update log</button>
          <button type="button" aria-pressed={tab === "panel"} onClick={() => setTab("panel")}>Panel log</button>
        </div>
        {tab === "update" ? (
          <LogPanel text={update.log} ariaLabel="Update log" emptyText="Nothing yet. Press Pull, build and restart to see the build here." />
        ) : (
          <LogPanel text={panelLog} ariaLabel="Panel log" emptyText="The panel has not written anything yet." />
        )}
      </div>

      <div className="card-foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" disabled={update.isBusy || update.isDown} onClick={() => setPending("force")}>
          Rebuild anyway
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={update.isBusy || update.isDown || isUpToDate}
          title={isUpToDate ? "Already on the newest version" : undefined}
          onClick={() => setPending("normal")}
        >
          {update.isBusy ? "Working…" : check && check.behind > 0 ? `Update now (${check.behind})` : "Pull, build and restart"}
        </button>
      </div>
    </section>
  );
}
