"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client-api";
import { formatDateTime, timeAgo } from "@/lib/format";

interface Entry {
  id: number;
  at: string;
  actor: string;
  action: string;
  label: string;
  target: string;
  targetName: string;
  detail: string;
}

const PAGE = 25;
const REFRESH_MS = 30_000;

/** Who did what, and when: the changes made through the panel, newest first. */
export function ActivityCard() {
  const { data } = useFetch<Entry[]>(`/api/audit?limit=${PAGE}`, REFRESH_MS);
  const [older, setOlder] = useState<Entry[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const entries = [...(data ?? []), ...older.filter((o) => !data?.some((d) => d.id === o.id))];

  const loadMore = async () => {
    setIsLoading(true);
    try {
      const next = await api<Entry[]>(`/api/audit?limit=${PAGE}&offset=${entries.length}`);
      setOlder((current) => [...current, ...next]);
      if (next.length < PAGE) setIsDone(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="card" aria-labelledby="activity-heading">
      <div className="card-head">
        <h2 className="h3" id="activity-heading">Activity</h2>
        <p className="sub">
          What was changed through the panel, and from which address. Passwords and variable values are never recorded. The newest
          5,000 entries are kept.
        </p>
      </div>
      {data && entries.length === 0 && <div className="card-pad"><p className="sub">Nothing has been recorded yet.</p></div>}
      {entries.length > 0 && (
        <ul className="rows">
          {entries.map((entry) => (
            <li className="row" key={entry.id} style={{ padding: "10px 24px" }}>
              <div className="row-main">
                <div className="row-title">
                  {entry.label}
                  {entry.targetName && <> · <span className="mono">{entry.targetName}</span></>}
                </div>
                <div className="row-desc">
                  {entry.detail && <>{entry.detail} · </>}
                  from <span className="mono">{entry.actor}</span>
                </div>
              </div>
              <div className="row-end small muted" title={formatDateTime(entry.at)}>{timeAgo(entry.at)}</div>
            </li>
          ))}
        </ul>
      )}
      {entries.length >= PAGE && !isDone && (
        <div className="card-foot" style={{ justifyContent: "center" }}>
          <button type="button" className="btn sm" disabled={isLoading} onClick={() => void loadMore()}>
            {isLoading ? "Loading…" : "Show older"}
          </button>
        </div>
      )}
    </section>
  );
}
