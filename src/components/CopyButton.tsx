"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

type Props = {
  text: string;
  label?: string;
  disabled?: boolean;
};

type State = "idle" | "copied" | "failed";

const RESET_MS = 2000;

export function CopyButton({ text, label = "Copy", disabled }: Props) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), RESET_MS);
  };

  return (
    <button type="button" className="btn sm" disabled={disabled} onClick={handleClick} aria-live="polite">
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
