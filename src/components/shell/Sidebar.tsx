"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { missingRequirements, useSystem } from "@/hooks/useSystem";
import { useFetch } from "@/hooks/useFetch";
import { useProjects } from "@/hooks/useProjects";
import { prefetchRoute } from "@/lib/client-cache";
import { Logo } from "../Logo";
import { DatabasesIcon, DeploymentsIcon, DomainsIcon, ProjectsIcon, SearchIcon, SetupIcon, SettingsIcon, ChevronIcon, SignOutIcon } from "./icons";

interface NavEntry {
  href: string;
  label: string;
  icon: ReactNode;
  /** Other path prefixes that should also highlight this item. */
  also?: string[];
}

const NAV_GROUPS: NavEntry[][] = [
  [
    { href: "/", label: "Projects", icon: <ProjectsIcon />, also: ["/projects", "/new"] },
    { href: "/deployments", label: "Deployments", icon: <DeploymentsIcon /> },
  ],
  [
    { href: "/domains", label: "Domains", icon: <DomainsIcon /> },
    { href: "/databases", label: "Databases", icon: <DatabasesIcon /> },
  ],
  [{ href: "/settings", label: "Settings", icon: <SettingsIcon /> }],
];

function isActive(entry: NavEntry, pathname: string): boolean {
  if (entry.href === "/") return pathname === "/" || (entry.also ?? []).some((p) => pathname.startsWith(p));
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

interface Props {
  onFind: () => void;
}

export function Sidebar({ onFind }: Props) {
  const pathname = usePathname();
  const { projects } = useProjects();
  const { data: system } = useSystem();
  const { data: settings } = useFetch<{ passwordProtected: boolean }>("/api/settings");
  const missing = missingRequirements(system);

  return (
    <div className="sidebar-inner">
      <Link href="/" className="workspace-switch" aria-label="RenVer home" onMouseEnter={() => prefetchRoute("/")}>
        <span className="brand-mark"><Logo size={24} /></span>
        <span className="workspace-name">RenVer</span>
        <span className="badge">Local</span>
        <span className="workspace-chevron"><ChevronIcon size={14} /></span>
      </Link>

      <button type="button" className="find" onClick={onFind} aria-label="Find a page or project" aria-keyshortcuts="F">
        <SearchIcon />
        <span>Find</span>
        <kbd>F</kbd>
      </button>

      <nav className="nav-groups" aria-label="Main">
        {NAV_GROUPS.map((group, index) => (
          <div className="nav-group" key={index}>
            {group.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="nav-item"
                aria-current={isActive(entry, pathname) ? "page" : undefined}
                onMouseEnter={() => prefetchRoute(entry.href)}
                onFocus={() => prefetchRoute(entry.href)}
              >
                {entry.icon}
                <span>{entry.label}</span>
                {entry.href === "/" && projects && projects.length > 0 && <span className="nav-count">{projects.length}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      {missing.length > 0 && (
        <Link href="/setup" className="nav-item setup-alert" title={missing.map((c) => c.label).join(", ")}>
          <SetupIcon />
          <span>Finish setup</span>
          <span className="nav-count warn">{missing.length}</span>
        </Link>
      )}

      {settings?.passwordProtected && (
        <button type="button" className="nav-item sign-out" onClick={() => void signOut()}>
          <SignOutIcon />
          <span>Sign out</span>
        </button>
      )}
    </div>
  );
}

/** Clears this browser's sign-in (and code) cookies, then shows the sign-in page. */
async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    window.location.assign("/login");
  }
}
