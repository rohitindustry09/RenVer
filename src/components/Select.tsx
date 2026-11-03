"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { moveSelection } from "@/lib/select-nav";

export interface SelectOption {
  value: string;
  label: string;
  /** Smaller line under the label. */
  hint?: string;
  isDisabled?: boolean;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  isDisabled?: boolean;
}

interface Position {
  top: number;
  left: number;
  width: number;
  isAbove: boolean;
}

const MENU_MAX_HEIGHT = 280;
const MENU_GAP = 6;
const MIN_MENU_WIDTH = 160;
const subscribeNothing = () => () => {};

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.500 6.500 3.500 3.500 3.500-3.500" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.500 8.500 3 3 6-7" />
    </svg>
  );
}

/** A dropdown that looks like the rest of the app, in place of the browser's own list. */
export function Select({ value, options, onChange, ariaLabel, className = "", style, isDisabled = false }: Props) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActiveState] = useState(-1);
  // Keystrokes can arrive faster than React re-renders, so the latest highlight is also kept here.
  const activeRef = useRef(-1);
  const setActive = useCallback((next: number) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);
  const [position, setPosition] = useState<Position | null>(null);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const selected = options.find((o) => o.value === value);
  const navigable = options.map((o) => ({ isDisabled: o.isDisabled }));

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const isAbove = window.innerHeight - rect.bottom < Math.min(MENU_MAX_HEIGHT, options.length * 44 + 16) && rect.top > window.innerHeight - rect.bottom;
    setPosition({
      top: isAbove ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
      left: rect.left,
      width: Math.max(rect.width, MIN_MENU_WIDTH),
      isAbove,
    });
  }, [options.length]);

  const open = () => {
    if (isDisabled) return;
    place();
    setActive(options.findIndex((o) => o.value === value && !o.isDisabled));
    setIsOpen(true);
  };

  const close = useCallback((refocus: boolean) => {
    setIsOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.isDisabled) return;
    onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const onScrollOrResize = (event: Event) => {
      if (event.type === "scroll" && menuRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen && active >= 0) menuRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Tab") {
      if (isOpen) close(false);
      return;
    }
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(moveSelection(navigable, activeRef.current, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(moveSelection(navigable, activeRef.current, -1));
        break;
      case "Home":
        event.preventDefault();
        setActive(moveSelection(navigable, -1, 1));
        break;
      case "End":
        event.preventDefault();
        setActive(moveSelection(navigable, -1, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeRef.current);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
    }
  };

  const menuStyle: CSSProperties | undefined = position
    ? {
        left: position.left,
        width: position.width,
        maxHeight: MENU_MAX_HEIGHT,
        ...(position.isAbove ? { bottom: window.innerHeight - position.top } : { top: position.top }),
      }
    : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={isDisabled}
        className={`select-trigger ${className}`}
        style={style}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selected?.label ?? "Select…"}</span>
        <ChevronDown />
      </button>
      {isOpen && isClient && menuStyle &&
        createPortal(
          <ul ref={menuRef} id={listId} role="listbox" aria-label={ariaLabel} className="select-menu fade-in" style={menuStyle}>
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.isDisabled || undefined}
                data-active={index === active || undefined}
                className="select-option"
                onMouseEnter={() => !option.isDisabled && setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
              >
                <span className="select-option-text">
                  <span>{option.label}</span>
                  {option.hint && <span className="select-option-hint">{option.hint}</span>}
                </span>
                {option.value === value && <Check />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
