"use client";

import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { mergeEnvRows, parseEnvPaste, type EnvRow } from "@/lib/env-text";

interface Props {
  rows: EnvRow[];
  onChange: (rows: EnvRow[]) => void;
}

const EMPTY_ROW: EnvRow = { key: "", value: "" };
const MAX_FILE_BYTES = 256 * 1024;

export function EnvEditor({ rows, onChange }: Props) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  /** Reads a .env file chosen from the computer. Variables with the same name are replaced; the rest are kept. */
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNote({ ok: false, text: "That file is too large to be a .env file." });
      return;
    }
    try {
      const parsed = parseEnvPaste(await file.text());
      if (parsed.length === 0) {
        setNote({ ok: false, text: `No variables found in ${file.name}. Each line should look like KEY=value.` });
        return;
      }
      onChange(mergeEnvRows(rows, parsed));
      setNote({ ok: true, text: `Imported ${parsed.length} variable${parsed.length === 1 ? "" : "s"} from ${file.name}.` });
    } catch {
      setNote({ ok: false, text: "Could not read that file." });
    }
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
        <span className="toolbar">
          <button type="button" className="btn sm" onClick={() => onChange([...rows, EMPTY_ROW])}>
            + Add another
          </button>
          <button type="button" className="btn sm" onClick={() => fileInput.current?.click()}>
            Import .env file
          </button>
          <input ref={fileInput} type="file" accept=".env,.txt,text/plain" hidden onChange={(e) => void importFile(e)} aria-label="Choose a .env file" />
        </span>
        <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={isRevealed} onChange={(e) => setIsRevealed(e.target.checked)} />
          Show values
        </label>
      </div>
      {note && <p className={`notice${note.ok ? "" : " error"}`} role="status">{note.text}</p>}
      <p className="small muted">Import a .env file, or paste one into any name field, to fill several rows. Values are stored encrypted and never leave your browser until you deploy.</p>
    </div>
  );
}
