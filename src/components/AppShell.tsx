"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "./shell/CommandPalette";
import { Sidebar } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);

  // The mobile menu closes once a page has been chosen.
  useEffect(() => setIsMenuOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isShortcut = (event.key === "k" && (event.metaKey || event.ctrlKey)) || ((event.key === "f" || event.key === "/") && !event.metaKey && !event.ctrlKey && !event.altKey);
      if (isShortcut && !isTypingTarget(event.target)) {
        event.preventDefault();
        setIsFindOpen(true);
      } else if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <aside className={`sidebar${isMenuOpen ? " open" : ""}`} aria-label="Sidebar">
        <Sidebar onFind={() => { setIsMenuOpen(false); setIsFindOpen(true); }} />
      </aside>
      {isMenuOpen && <div className="scrim" onClick={() => setIsMenuOpen(false)} aria-hidden="true" />}

      <div className="content">
        <TopBar onMenu={() => setIsMenuOpen(true)} />
        <main className="page">
          <div className="container">{children}</div>
        </main>
      </div>

      <CommandPalette open={isFindOpen} onClose={() => setIsFindOpen(false)} />
    </div>
  );
}
