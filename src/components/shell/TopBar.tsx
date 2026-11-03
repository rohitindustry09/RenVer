"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pageTitle } from "@/lib/page-title";
import { prefetchRoute } from "@/lib/client-cache";
import { TopBarStatus } from "../TopBarStatus";
import { MenuIcon, PlusIcon } from "./icons";

interface Props {
  onMenu: () => void;
}

export function TopBar({ onMenu }: Props) {
  const pathname = usePathname();
  return (
    <header className="topbar2">
      <button type="button" className="menu-btn" onClick={onMenu} aria-label="Open menu">
        <MenuIcon size={18} />
      </button>
      <h1 className="topbar-title">{pageTitle(pathname)}</h1>
      <div className="topbar-spacer" />
      <TopBarStatus />
      <Link href="/new" className="btn sm" onMouseEnter={() => prefetchRoute("/new")}>
        <PlusIcon /> Create New
      </Link>
    </header>
  );
}
