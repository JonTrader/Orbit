"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SpaceSidebar } from "./SpaceSidebar";
import type { SidebarFooterUser } from "./SidebarFooter";

interface SidebarNavContextValue {
  openSidebar: () => void;
  closeSidebar: () => void;
}

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

/** Opens the mobile Spaces drawer; must be used under SpaceSidebarShell. */
export function useOpenSidebar(): () => void {
  const value = useContext(SidebarNavContext);
  if (!value) {
    throw new Error("useOpenSidebar must be used within SpaceSidebarShell");
  }
  return value.openSidebar;
}

export interface SpaceSidebarShellProps {
  user?: SidebarFooterUser;
  /** Whether the Viewer has an email/password account. */
  canChangePassword?: boolean;
  /** Server-rendered streamed slot; see SidebarSpaces. */
  spacesSlot?: ReactNode;
  children?: ReactNode;
}

/**
 * Persistent sidebar frame: grid, mobile drawer, and Space list. Lives in
 * the `(active)` layout so it does not remount when spaceId changes.
 */
export function SpaceSidebarShell({
  user,
  canChangePassword = false,
  spacesSlot,
  children,
}: SpaceSidebarShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const nav = useMemo(
    () => ({ openSidebar, closeSidebar }),
    [openSidebar, closeSidebar],
  );

  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <SidebarNavContext.Provider value={nav}>
      <div className="grid min-h-screen w-full max-w-[100vw] overflow-x-hidden lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
            onClick={closeSidebar}
          />
        ) : null}

        <div
          className={[
            "fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] transition-transform duration-200 lg:static lg:w-auto lg:translate-x-0",
            sidebarOpen
              ? "translate-x-0 shadow-[8px_0_32px_rgba(28,25,23,0.08)]"
              : "translate-x-[-105%]",
          ].join(" ")}
        >
          <SpaceSidebar
            user={user}
            canChangePassword={canChangePassword}
            spacesSlot={spacesSlot}
            onNavClick={closeSidebar}
          />
        </div>

        {children}
      </div>
    </SidebarNavContext.Provider>
  );
}
