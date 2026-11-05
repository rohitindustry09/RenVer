"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { DataPage, DataTable } from "@/lib/data-view";
import { Modal } from "../Modal";
import { Select } from "../Select";

interface Props {
  databaseId: string;
  databaseName: string;
  onClose: () => void;
}

const MAX_CELL_CHARS = 160;

function show(value: unknown): { text: string; isNull: boolean; full: string } {
  if (value === null || value === undefined) return { text: "NULL", isNull: true, full: "NULL" };
  const full = typeof value === "string" ? value : JSON.stringify(value);
  return { text: full.length > MAX_CELL_CHARS ? `${full.slice(0, MAX_CELL_CHARS)}…` : full, isNull: false, full };
}

const key = (t: DataTable): string => `${t.schema}\u0000${t.name}`;
const label = (t: DataTable): string => (t.schema && t.schema !== "public" ? `${t.schema}.${t.name}` : t.name);

/** A read-only look at a database's tables and rows. Nothing here can change the data. */
export function DataViewer({ databaseId, databaseName, onClose }: Props) {
  const [tables, setTables] = useState<DataTable[] | null>(null);
  const [selected, setSelected] = useState<DataTable | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<DataPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ tables: DataTable[] }>(`/api/databases/${databaseId}/data`)
      .then((result) => {
        if (cancelled) return;
        setTables(result.tables);
        if (result.tables[0]) setSelected(result.tables[0]);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not read the database."));
    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ table: selected.name, schema: selected.schema, page: String(page) });
    api<DataPage>(`/api/databases/${databaseId}/data?${params}`)
      .then((result) => !cancelled && setData(result))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Could not read the table."))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [databaseId, selected, page]);

  const choose = (table: DataTable) => {
    setSelected(table);
    setPage(0);
    setData(null);
  };

  const first = data ? data.page * data.pageSize + 1 : 0;
  const last = data ? data.page * data.pageSize + data.rows.length : 0;
  const hasNext = data ? (data.isCapped ? true : last < data.counted) : false;

  return (
    <Modal title={`Data in ${databaseName}`} onClose={onClose} wide>
      <div className="stack-sm" style={{ minWidth: 0 }}>
        <p className="small muted">Read-only: you can look, but nothing here can change or delete data.</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        {!tables && !error && <p className="small muted">Loading tables…</p>}
        {tables && tables.length === 0 && <p className="notice">This database has no tables yet. They appear once an app creates them (for example after its first deploy).</p>}

        {tables && tables.length > 0 && (
          <>
            <div className="field">
              <span className="label">Table</span>
              <Select
                value={selected ? key(selected) : ""}
                ariaLabel="Table to show"
                onChange={(value) => {
                  const next = tables.find((t) => key(t) === value);
                  if (next) choose(next);
                }}
                options={tables.map((t) => ({
                  value: key(t),
                  label: label(t),
                  hint: t.estimate > 0 ? `about ${t.estimate.toLocaleString()} rows` : undefined,
                }))}
              />
            </div>

            {isLoading && <p className="small muted">Loading rows…</p>}

            {data && (
              <>
                <div style={{ overflow: "auto", maxHeight: "55vh", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <table className="dns-table" style={{ width: "max-content", minWidth: "100%" }} aria-label={`Rows of ${selected ? label(selected) : "table"}`}>
                    <thead>
                      <tr>
                        {data.columns.map((c) => (
                          <th key={c.name} title={c.type}>{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.length === 0 && (
                        <tr><td colSpan={Math.max(1, data.columns.length)} className="muted">This table is empty.</td></tr>
                      )}
                      {data.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((value, c) => {
                            const cellText = show(value);
                            return (
                              <td key={c} title={cellText.full.length > MAX_CELL_CHARS ? cellText.full.slice(0, 2000) : undefined} style={{ maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: cellText.isNull ? "var(--text-3)" : undefined }}>
                                {cellText.text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="toolbar" style={{ justifyContent: "space-between" }}>
                  <span className="small muted">
                    {data.rows.length === 0 ? "No rows" : `Rows ${first.toLocaleString()}–${last.toLocaleString()} of ${data.counted.toLocaleString()}${data.isCapped ? "+" : ""}`}
                  </span>
                  <span className="toolbar">
                    <button type="button" className="btn sm" disabled={page === 0 || isLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button>
                    <button type="button" className="btn sm" disabled={!hasNext || isLoading} onClick={() => setPage((p) => p + 1)}>Next</button>
                  </span>
                </div>
              </>
            )}
          </>
        )}
        <div className="toolbar" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
