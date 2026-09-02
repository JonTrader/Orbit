"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { SpaceNavItem } from "@/lib/spaces/nav";

import { AddSectionButton } from "./AddSectionButton";
import { SectionTabs } from "./SectionTabs";
import { SpaceSidebar } from "./SpaceSidebar";
import type { SidebarFooterUser } from "./SidebarFooter";

export interface SpaceLayoutActiveSpace {
  id: string;
  name: string;
}

export interface SpaceLayoutProps {
  user?: SidebarFooterUser;
  activeSpace: SpaceLayoutActiveSpace;
  /** Server-rendered streamed slot; see SidebarSpaces. */
  spacesSlot?: ReactNode;
  navItems: SpaceNavItem[];
  /** Whether the Viewer may create or mutate content in this Space. */
  canMutateContent?: boolean;
  /** Whether the Viewer has an email/password account. */
  canChangePassword?: boolean;
  /** Server-rendered streamed slot; see ShareBarSlot. */
  shareBarSlot?: ReactNode;
  children?: ReactNode;
}

export function SpaceLayout({
  user,
  activeSpace,
  spacesSlot,
  navItems,
  canMutateContent = false,
  canChangePassword = false,
  shareBarSlot,
  children,
}: SpaceLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const current = navItems.find((item) => item.href === pathname);

  return (
    <div className="grid min-h-screen lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
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
          navItems={navItems}
          onNavClick={() => setSidebarOpen(false)}
        />
      </div>

      <main className="mx-auto w-full max-w-[720px] px-4 py-5 pb-16 sm:px-6 sm:py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <header>
            <div className="mb-1 flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
              <span>Active Space · {activeSpace.name}</span>
              {!canMutateContent ? (
                <span className="rounded bg-line px-1.5 py-0.5 text-[0.6rem] font-bold tracking-[0.06em] text-muted">
                  Read-only
                </span>
              ) : null}
            </div>
            <h1 className="text-[1.75rem] font-bold tracking-[-0.03em]">
              {current?.label ?? "Orbit"}
            </h1>
            {current ? (
              <p className="mt-1 text-[0.95rem] text-muted">{current.sub}</p>
            ) : null}
          </header>
          <button
            type="button"
            aria-label="Open spaces"
            className="inline-flex items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:border-muted hover:bg-panel/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
            Spaces
          </button>
        </div>

        <div className="mb-4 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <SectionTabs items={navItems} />
          </div>
          <AddSectionButton
            spaceId={activeSpace.id}
            disabled={!canMutateContent}
          />
        </div>

        {children}

        {shareBarSlot}
      </main>
    </div>
  );
}
