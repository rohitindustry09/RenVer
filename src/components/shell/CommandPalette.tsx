"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useProjects } from "@/hooks/useProjects";
import { prefetchRoute } from "@/lib/client-cache";
import { filterCommands, type Command } from "@/lib/command-search";
import { SearchIcon } from "./icons";

const PAGES: Command[] = [
  { id: "page-projects", label: "Projects", hint: "All projects", href: "/", group: "Pages" },
  { id: "page-new", label: "New project", hint: "Import from GitHub or upload a zip", href: "/new", group: "Pages" },
  { id: "page-deployments", label: "Deployments", hint: "Every build", href: "/deployments", group: "Pages" },
  { id: "page-domains", label: "Domains", hint: "Add and verify domains", href: "/domains", group: "Pages" },
  { id: "page-databases", label: "Databases", hint: "PostgreSQL, MySQL, MariaDB", href: "/databases", group: "Pages" },
  { id: "page-settings", label: "Settings", hint: "Resources, backups, theme", href: "/settings", group: "Pages" },
  { id: "page-setup", label: "Setup", hint: "Docker, Caddy, Git, Node.js", href: "/setup", group: "Pages" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/** "Find": jump to any page or project from the keyboard. */
export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { projects } = useProjects();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...PAGES,
      ...(projects ?? []).map((p) => ({
        id: `project-${p.id}`,
        label: p.name,
        hint: p.primaryHost,
        href: `/projects/${p.id}`,
        group: "Projects",
      })),
    ],
    [projects],
  );
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    router.push(command.href);
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette fade-in" role="dialog" aria-modal="true" aria-label="Find" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <SearchIcon />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Find a page or project…"
            aria-label="Find a page or project"
            aria-controls="palette-results"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox" ref={list}>
          {results.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
          {results.map((command, index) => (
            <li key={command.id} role="presentation">
              {(index === 0 || results[index - 1]!.group !== command.group) && <div className="palette-group">{command.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className="palette-item"
                onMouseEnter={() => {
                  setActive(index);
                  prefetchRoute(command.href);
                }}
                onClick={() => go(command)}
              >
                <span>{command.label}</span>
                <span className="palette-hint">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
