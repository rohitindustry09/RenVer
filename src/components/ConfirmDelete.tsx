"use client";

import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  title: string;
  /** What the person must type to unlock the button, e.g. the name of the thing being deleted. */
  phrase: string;
  /** What will be lost. */
  message: string;
  actionLabel?: string;
  busyLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The "type its name to delete it" popup used by every destructive action. */
export function ConfirmDelete({ title, phrase, message, actionLabel = "Delete forever", busyLabel = "Deleting…", isBusy, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      title={title}
      message={message}
      phrase={phrase}
      confirmLabel={actionLabel}
      busyLabel={busyLabel}
      isBusy={isBusy}
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
