"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  SidebarNavProvider,
  useOpenSidebar,
} from "./SidebarNavContext";
import { SpaceSidebar } from "./SpaceSidebar";
import type { SidebarFooterUser } from "./SidebarFooter";

export { useOpenSidebar };

export interface SpaceSidebarShellProps {
  user?: SidebarFooterUser;
  /** Whether the Viewer has an email/password account. */
  canChangePassword?: boolean;
  /** Server-rendered streamed slot; see SidebarSpaces. */
  spacesSlot?: ReactNode;
  children?: ReactNode;
}

/**
 * Persistent sidebar frame: mobile drawer and Space list. Lives in the
 * `(active)` layout so it does not remount when spaceId changes. The rail is
 * `position: fixed` on all breakpoints so its height stays viewport-bound when
 * SpaceLayout content grows (sticky fails under overflow clipping ancestors).
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
    <SidebarNavProvider value={nav}>
      <div className="relative min-h-screen w-full">
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
            "fixed inset-y-0 left-0 z-40 flex w-[min(18rem,88vw)] transition-transform duration-200",
            "lg:w-[var(--sidebar-w)] lg:translate-x-0",
            sidebarOpen
              ? "translate-x-0 shadow-[8px_0_32px_rgba(28,25,23,0.08)]"
              : "translate-x-[-105%] lg:translate-x-0",
          ].join(" ")}
        >
          <SpaceSidebar
            user={user}
            canChangePassword={canChangePassword}
            spacesSlot={spacesSlot}
            onNavClick={closeSidebar}
          />
        </div>

        <div className="min-w-0 lg:pl-[var(--sidebar-w)]">{children}</div>
      </div>
    </SidebarNavProvider>
  );
}
