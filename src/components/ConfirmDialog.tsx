"use client";

import { useState } from "react";
import { matchesConfirmPhrase } from "@/lib/confirm-phrase";
import { Modal } from "./Modal";

interface Props {
  title: string;
  message: React.ReactNode;
  /** Extra content under the message, for example a field the action needs. */
  extra?: React.ReactNode;
  /** When set, the button stays locked until this is typed exactly. */
  phrase?: string;
  confirmLabel: string;
  busyLabel?: string;
  isBusy?: boolean;
  /** "danger" for things that cannot be undone. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

/** The popup every confirmation uses, in place of the browser's own alert box. */
export function ConfirmDialog({ title, message, extra, phrase, confirmLabel, busyLabel = "Working…", isBusy = false, tone = "primary", onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const isReady = !isBusy && (phrase === undefined || matchesConfirmPhrase(typed, phrase));

  return (
    <Modal title={title} onClose={isBusy ? () => {} : onCancel}>
      <div className="stack-sm">
        <div className="sub">{message}</div>
        {extra}
        {phrase !== undefined && (
          <>
            <p className="sub">Type <strong className="mono">{phrase}</strong> to confirm.</p>
            <input
              className="input mono"
              value={typed}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label={`Type ${phrase} to confirm`}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && isReady && onConfirm()}
            />
          </>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" disabled={isBusy} onClick={onCancel}>Cancel</button>
        <button type="button" className={`btn ${tone}`} disabled={!isReady} autoFocus={phrase === undefined} onClick={onConfirm}>
          {isBusy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
