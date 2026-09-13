"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const POPOVER_GAP = 8;
const VIEWPORT_PAD = 8;

interface DatePickerProps {
  /** Accessible name for the trigger. */
  label: string;
  /** ISO calendar day `YYYY-MM-DD`, or empty when unset. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  className?: string;
  /** Compact trigger matching a native date field in the compose row. */
  compact?: boolean;
}

function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function fromISO(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatCompact(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

function cellsFor(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const cell = new Date(start);
    cell.setDate(start.getDate() + i);
    cells.push(cell);
  }
  return cells;
}

function clampToMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Optional Task due-date control. Trigger plus a portaled calendar popover
 * matching Orbit dialog chrome: today is the accent inset used on Section
 * tabs, selected is ink fill, past days stay selectable. ISO `YYYY-MM-DD`
 * is the stored value.
 */
export function DatePicker({
  label,
  value,
  onChange,
  disabled = false,
  className = "",
  compact = false,
}: DatePickerProps) {
  const reactId = useId();
  const buttonId = `${reactId}-btn`;
  const titleId = `${reactId}-title`;
  const today = useMemo(() => startOfToday(), []);
  const isClient = useIsClient();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [focused, setFocused] = useState(today);

  function close(restoreFocus = true) {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function openPicker() {
    if (disabled) return;
    if (value) {
      const selected = fromISO(value);
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
      setFocused(selected);
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
      setFocused(new Date(today));
    }
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    const year = next.getFullYear();
    const month = next.getMonth();
    setViewYear(year);
    setViewMonth(month);
    setFocused(clampToMonth(year, month, focused.getDate()));
  }

  function moveFocus(days: number) {
    const next = new Date(focused);
    next.setDate(next.getDate() + days);
    setFocused(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function selectISO(iso: string) {
    onChange(iso);
    close(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    const trigger = buttonRef.current;
    if (!popover || !trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const maxBottom = window.innerHeight - VIEWPORT_PAD;
    const maxRight = window.innerWidth - VIEWPORT_PAD;

    let top = triggerRect.bottom + POPOVER_GAP;
    if (top + popoverRect.height > maxBottom) {
      top = triggerRect.top - POPOVER_GAP - popoverRect.height;
    }
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

    let left = triggerRect.left;
    if (left + popoverRect.width > maxRight) {
      left = maxRight - popoverRect.width;
    }
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

    setPosition({ top, left });
    gridRef.current?.focus();
  }, [open, viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }

    function onViewportChange() {
      close(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in step) {
      event.preventDefault();
      moveFocus(step[event.key]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectISO(toISO(focused));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      shiftMonth(event.shiftKey ? -12 : -1);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      shiftMonth(event.shiftKey ? 12 : 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setFocused(new Date(viewYear, viewMonth, 1));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setFocused(new Date(viewYear, viewMonth + 1, 0));
    }
  }

  const cells = cellsFor(viewYear, viewMonth);
  const focusedId = `${reactId}-d-${toISO(focused)}`;
  const selectedIso = value === "" ? null : value;

  const triggerClass = compact
    ? [
        "flex h-[2.15rem] w-full items-center justify-between gap-2 rounded border border-line bg-panel px-2 py-[0.4rem] font-mono text-[0.78rem] outline-none",
        "hover:border-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        open ? "border-accent" : "",
        disabled ? "opacity-60" : "",
      ].join(" ")
    : [
        "mb-0 flex w-full items-center justify-between rounded border border-line bg-panel px-[0.7rem] py-2 text-left text-[0.92rem] outline-none",
        "hover:border-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        open ? "border-accent" : "",
        disabled ? "opacity-60" : "",
      ].join(" ");

  return (
    <div className={className || undefined}>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}, ${formatCompact(value)}` : label}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={(event) => {
          if (open || disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter") {
            event.preventDefault();
            openPicker();
          }
        }}
        className={triggerClass}
      >
        <span className={value ? "text-ink" : "text-muted"}>
          {value ? formatCompact(value) : "mm/dd/yyyy"}
        </span>
        <CalendarGlyph />
      </button>
      {isClient && open
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Choose due date"
              style={{
                position: "fixed",
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? "visible" : "hidden",
              }}
              className="z-50 w-[18.5rem] rounded border border-line bg-panel p-3 shadow-[0_8px_24px_rgba(28,25,23,0.08)]"
            >
              <div className="mb-[0.55rem] flex items-center justify-between gap-[0.35rem]">
                <div className="flex gap-[0.15rem]">
                  <CalNavButton
                    label="Previous year"
                    onClick={() => shiftMonth(-12)}
                  >
                    ‹‹
                  </CalNavButton>
                  <CalNavButton
                    label="Previous month"
                    onClick={() => shiftMonth(-1)}
                  >
                    ‹
                  </CalNavButton>
                </div>
                <div id={titleId} className="text-[0.95rem] font-semibold text-ink">
                  {MONTHS[viewMonth]} {viewYear}
                </div>
                <div className="flex gap-[0.15rem]">
                  <CalNavButton label="Next month" onClick={() => shiftMonth(1)}>
                    ›
                  </CalNavButton>
                  <CalNavButton label="Next year" onClick={() => shiftMonth(12)}>
                    ››
                  </CalNavButton>
                </div>
              </div>
              <div className="mb-[0.2rem] grid grid-cols-7 gap-[0.1rem]">
                {DOW.map((day) => (
                  <span
                    key={day}
                    className="py-[0.2rem] text-center font-mono text-[0.62rem] uppercase tracking-[0.06em] text-muted"
                  >
                    {day}
                  </span>
                ))}
              </div>
              <div
                ref={gridRef}
                role="grid"
                aria-labelledby={titleId}
                aria-activedescendant={focusedId}
                tabIndex={0}
                onKeyDown={onGridKeyDown}
                className="grid grid-cols-7 gap-[0.15rem] outline-none"
              >
                {cells.map((cell) => {
                  const iso = toISO(cell);
                  const isToday = sameDay(cell, today);
                  const isSelected = selectedIso === iso;
                  const isFocused = sameDay(cell, focused);
                  const out = cell.getMonth() !== viewMonth;
                  const names = [
                    cell.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }),
                    isToday ? "today" : null,
                    isSelected ? "selected" : null,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      id={`${reactId}-d-${iso}`}
                      tabIndex={-1}
                      aria-label={names}
                      aria-selected={isSelected}
                      onClick={() => selectISO(iso)}
                      className={[
                        "relative aspect-square rounded text-[0.85rem] text-ink",
                        "hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                        out ? "text-muted opacity-55" : "",
                        isToday
                          ? "font-semibold shadow-[inset_0_2px_0_var(--accent)]"
                          : "",
                        isSelected ? "bg-ink font-semibold text-white hover:bg-ink" : "",
                        isSelected && isToday
                          ? "shadow-[inset_0_2px_0_color-mix(in_srgb,var(--accent)_80%,white)]"
                          : "",
                        isFocused
                          ? "outline outline-2 outline-offset-1 outline-accent"
                          : "",
                      ].join(" ")}
                    >
                      {cell.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-[0.6rem] flex items-center justify-between border-t border-line pt-[0.55rem]">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close(true);
                  }}
                  className="rounded px-[0.35rem] py-1 text-[0.8rem] font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Clear date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewYear(today.getFullYear());
                    setViewMonth(today.getMonth());
                    setFocused(new Date(today));
                  }}
                  className="rounded px-[0.35rem] py-1 text-[0.8rem] font-semibold text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Today
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CalendarGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted"
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M1.5 6h13M5 1.5v3M11 1.5v3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalNavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="size-[1.85rem] rounded bg-transparent text-[0.9rem] font-semibold text-muted hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
