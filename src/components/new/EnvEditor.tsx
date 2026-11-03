"use client";

import { useState, type ClipboardEvent } from "react";
import { parseEnvPaste, type EnvRow } from "@/lib/env-text";

interface Props {
  rows: EnvRow[];
  onChange: (rows: EnvRow[]) => void;
}

const EMPTY_ROW: EnvRow = { key: "", value: "" };

export function EnvEditor({ rows, onChange }: Props) {
  const [isRevealed, setIsRevealed] = useState(false);

  const update = (index: number, patch: Partial<EnvRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [EMPTY_ROW]);
  };

  /** Pasting a whole .env file into a name field fills every row at once. */
  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const parsed = parseEnvPaste(text);
    if (parsed.length < 2 && !text.includes("=")) return;
    if (parsed.length === 0) return;
    event.preventDefault();
    const before = rows.slice(0, index);
    const after = rows.slice(index + 1).filter((r) => r.key || r.value);
    onChange([...before, ...parsed, ...after]);
  };

  return (
    <div className="stack-sm">
      {rows.map((row, index) => (
        <div className="env-row" key={index}>
          <input
            className="input mono"
            placeholder="KEY"
            aria-label={`Variable ${index + 1} name`}
            value={row.key}
            onChange={(e) => update(index, { key: e.target.value })}
            onPaste={(e) => handlePaste(index, e)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="input mono value"
            placeholder="value"
            aria-label={`Variable ${index + 1} value`}
            type={isRevealed ? "text" : "password"}
            value={row.value}
            onChange={(e) => update(index, { value: e.target.value })}
            autoComplete="new-password"
            spellCheck={false}
          />
          <button type="button" className="btn icon-btn ghost" aria-label={`Remove variable ${index + 1}`} onClick={() => remove(index)}>
            ✕
          </button>
        </div>
      ))}
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn sm" onClick={() => onChange([...rows, EMPTY_ROW])}>
          + Add another
        </button>
        <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={isRevealed} onChange={(e) => setIsRevealed(e.target.checked)} />
          Show values
        </label>
      </div>
      <p className="small muted">Paste a .env file into any name field to fill several rows. Values are stored encrypted.</p>
    </div>
  );
}
