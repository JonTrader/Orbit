"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Marks a destructive action for styling. */
  tone?: "default" | "danger";
}

interface RowMenuProps {
  items: readonly RowMenuItem[];
  /** Accessible name for the trigger button. */
  label?: string;
  /** Optional custom trigger; defaults to an overflow "…" button. */
  children?: ReactNode;
}

interface MenuPosition {
  top: number;
  left: number;
}

/** True after hydration so portals can target document.body. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const MENU_GAP = 4;
const VIEWPORT_PAD = 8;

/**
 * Portaled overflow menu for Space rows and Section panel headers. Positions
 * from the trigger's bounding rect on open, flipping above when there is not
 * enough room below (last directory rows). Closes on scroll/resize instead of
 * tracking continuously (overflow parents would clip a non-portaled menu).
 */
export function RowMenu({
  items,
  label = "More actions",
  children,
}: RowMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const isClient = useIsClient();

  function close() {
    setOpen(false);
    setPosition(null);
    triggerRef.current?.focus();
  }

  function openMenu() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // Tentative below-trigger placement; useLayoutEffect measures and flips.
    setPosition({ top: rect.bottom + MENU_GAP, left: rect.right });
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;

    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (menu && trigger) {
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const maxBottom = window.innerHeight - VIEWPORT_PAD;
      const maxRight = window.innerWidth - VIEWPORT_PAD;

      let top = triggerRect.bottom + MENU_GAP;
      if (top + menuRect.height > maxBottom) {
        top = triggerRect.top - MENU_GAP - menuRect.height;
      }
      if (top < VIEWPORT_PAD) {
        top = VIEWPORT_PAD;
      }

      // Menu is right-aligned via translateX(-100%); `left` is the right edge.
      let left = triggerRect.right;
      if (left > maxRight) {
        left = maxRight;
      }
      if (left - menuRect.width < VIEWPORT_PAD) {
        left = VIEWPORT_PAD + menuRect.width;
      }

      setPosition({ top, left });
    }

    const itemsEls = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    );
    itemsEls?.[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const itemsEls = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
          [],
      );
      if (itemsEls.length === 0) return;

      const currentIndex = itemsEls.findIndex(
        (el) => el === document.activeElement,
      );
      event.preventDefault();

      if (event.key === "ArrowDown") {
        const next =
          currentIndex < 0 ? 0 : (currentIndex + 1) % itemsEls.length;
        itemsEls[next]?.focus();
      } else {
        const next =
          currentIndex < 0
            ? itemsEls.length - 1
            : (currentIndex - 1 + itemsEls.length) % itemsEls.length;
        itemsEls[next]?.focus();
      }
    }

    function onViewportChange() {
      close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children ?? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-[1rem]"
            aria-hidden="true"
          >
            <path d="M6 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm5.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM16.5 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
          </svg>
        )}
      </button>

      {isClient && open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                transform: "translateX(-100%)",
              }}
              className="z-50 min-w-[10rem] overflow-hidden rounded border border-line bg-panel py-1 shadow-[0_12px_32px_rgba(28,25,23,0.12)]"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={[
                    "block w-full px-3 py-1.5 text-left text-[0.85rem] font-medium transition-colors focus-visible:outline-none",
                    item.tone === "danger"
                      ? "text-accent hover:bg-accent/10 focus-visible:bg-accent/10"
                      : "text-ink hover:bg-line focus-visible:bg-line",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
