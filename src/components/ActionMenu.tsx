"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { moveSelection } from "@/lib/select-nav";

export interface MenuItem {
  label: string;
  /** Opens a page. Use `onSelect` for actions. */
  href?: string;
  /** Opens in a new tab. */
  isExternal?: boolean;
  onSelect?: () => void;
  isDisabled?: boolean;
  tone?: "danger";
  /** A thin line is drawn above this item. */
  hasDivider?: boolean;
}

interface Props {
  items: MenuItem[];
  ariaLabel: string;
}

const MENU_WIDTH = 200;
const MENU_GAP = 6;
const subscribeNothing = () => () => {};

function Dots() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </svg>
  );
}

/** The "···" button that opens a short list of quick actions. */
export function ActionMenu({ items, ariaLabel }: Props) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const navigable = items.map((i) => ({ isDisabled: i.isDisabled }));

  const close = useCallback((refocus: boolean) => {
    setIsOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const isAbove = window.innerHeight - rect.bottom < items.length * 40 + 24 && rect.top > window.innerHeight - rect.bottom;
    setPosition({
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      ...(isAbove ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
    });
    setActive(moveSelection(navigable, -1, 1));
    setIsOpen(true);
  };

  const choose = useCallback((item: MenuItem | undefined) => {
    if (!item || item.isDisabled) return;
    close(false);
    item.onSelect?.();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onDismiss = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) menuRef.current?.focus();
  }, [isOpen]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => moveSelection(navigable, a, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => moveSelection(navigable, a, -1));
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items[active];
        if (item?.href) {
          close(false);
          if (item.isExternal) window.open(item.href, "_blank", "noopener,noreferrer");
          else window.location.assign(item.href);
        } else choose(item);
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-dots"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => (isOpen ? close(false) : open())}
      >
        <Dots />
      </button>
      {isOpen && isClient && position &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            tabIndex={-1}
            className="action-menu fade-in"
            style={{ ...position, width: MENU_WIDTH }}
            onKeyDown={onKeyDown}
          >
            {items.map((item, index) => {
              const className = `action-item${item.tone === "danger" ? " danger" : ""}${item.hasDivider ? " divided" : ""}`;
              const shared = {
                role: "menuitem" as const,
                className,
                "data-active": index === active || undefined,
                "aria-disabled": item.isDisabled || undefined,
                onMouseEnter: () => !item.isDisabled && setActive(index),
              };
              return (
                <li role="none" key={item.label}>
                  {item.href && !item.isDisabled ? (
                    item.isExternal ? (
                      <a {...shared} href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>{item.label}</a>
                    ) : (
                      <Link {...shared} href={item.href} onClick={() => close(false)}>{item.label}</Link>
                    )
                  ) : (
                    <button {...shared} type="button" disabled={item.isDisabled} onClick={() => choose(item)}>{item.label}</button>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
