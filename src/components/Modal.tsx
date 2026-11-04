"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  onClose: () => void;
  /** A wide popup that scrolls inside itself, for tables. */
  wide?: boolean;
  children: React.ReactNode;
}

const subscribeNothing = () => () => {};
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A centred popup over a dimmed page. Esc or a click outside closes it. While it is open, Tab stays inside it, and when
 * it closes focus goes back to what opened it, so keyboard and screen-reader users are not lost behind the page.
 */
export function Modal({ title, onClose, wide = false, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Portals need the document, which the server render does not have.
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);

  useEffect(() => {
    if (!isClient) return;
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isClient, onClose]);

  if (!isClient) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "modal wide" : "modal"} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
        <h2 className="h3" id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
