"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { filterRepos, moveActive, type RepoOption } from "@/lib/github-repos";
import { timeAgo } from "@/lib/format";

interface Props {
  /** The id of the input, so a label can point at it. */
  id: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (repo: RepoOption) => void;
  repos: RepoOption[];
  /** "off" when GitHub is not connected: the box then behaves like a plain text field. */
  status: "off" | "loading" | "ready" | "error";
  message?: string | null;
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/** The repository box. With GitHub connected, focusing it lists your repositories and typing narrows them down. */
export function RepoPicker({ id, value, onChange, onPick, repos, status, message }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const matches = useMemo(() => filterRepos(repos, value), [repos, value]);
  const hasMenu = status !== "off" && isOpen;

  const choose = (repo: RepoOption) => {
    onPick(repo);
    setIsOpen(false);
    setActive(-1);
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (status === "off") return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActive((current) => moveActive(current, matches.length, event.key as "ArrowDown" | "ArrowUp"));
    } else if (event.key === "Enter" && hasMenu && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="repo-picker">
      <input
        id={id}
        className="input mono"
        placeholder={status === "off" ? "github.com/owner/repo" : "Search your repositories or paste an address"}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActive(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKey}
        autoComplete="off"
        spellCheck={false}
        required
        role={status === "off" ? undefined : "combobox"}
        aria-expanded={status === "off" ? undefined : hasMenu}
        aria-controls={status === "off" ? undefined : listId}
        aria-autocomplete={status === "off" ? undefined : "list"}
        aria-activedescendant={hasMenu && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {hasMenu && (
        <ul className="select-menu repo-menu" id={listId} role="listbox" aria-label="Your repositories">
          {status === "loading" && <li className="repo-note">Loading your repositories…</li>}
          {status === "error" && <li className="repo-note error">{message ?? "Could not load your repositories."}</li>}
          {status === "ready" && matches.length === 0 && (
            <li className="repo-note">{repos.length === 0 ? "The token can see no repositories." : "No repository matches. You can still paste any public address."}</li>
          )}
          {status === "ready" &&
            matches.map((repo, index) => (
              <li
                key={repo.fullName}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className="select-option"
                data-active={index === active ? "" : undefined}
                // mouse-down (not click) so the input does not lose focus, and close, before the choice registers
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(repo);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="select-option-text">
                  <span className="mono repo-name">{repo.fullName}</span>
                  {repo.description && <span className="select-option-hint repo-desc">{repo.description}</span>}
                </span>
                <span className="repo-meta">
                  {repo.isPrivate && (
                    <span className="badge" title="Private repository">
                      <LockIcon /> Private
                    </span>
                  )}
                  {repo.pushedAt && <span className="small muted">{timeAgo(repo.pushedAt)}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
