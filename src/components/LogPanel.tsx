"use client";

import { useEffect, useRef } from "react";
import { CopyButton } from "./CopyButton";

type Props = {
  text: string;
  ariaLabel: string;
  emptyText?: string;
};

const STICK_THRESHOLD_PX = 40;

/** A log console with a Copy button. It follows new output unless the reader has scrolled up. */
export function LogPanel({ text, ariaLabel, emptyText = "Waiting for output…" }: Props) {
  const ref = useRef<HTMLPreElement>(null);
  const isPinned = useRef(true);

  const handleScroll = () => {
    const el = ref.current;
    if (el) isPinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  useEffect(() => {
    const el = ref.current;
    if (el && isPinned.current) el.scrollTo({ top: el.scrollHeight });
  }, [text]);

  const lineCount = text ? text.split("\n").filter(Boolean).length : 0;

  return (
    <div className="log-panel">
      <div className="log-bar">
        <span className="small muted">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
        <CopyButton text={text} label="Copy log" disabled={!text} />
      </div>
      <pre className="console" ref={ref} onScroll={handleScroll} aria-live="polite" aria-label={ariaLabel}>
        {text || emptyText}
      </pre>
    </div>
  );
}
