"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { SpaceNavItem } from "@/lib/spaces/nav";

import { AddSectionButton } from "./AddSectionButton";
import { SectionTabs } from "./SectionTabs";
import { useOpenSidebar } from "./SidebarNavContext";

export interface SpaceLayoutActiveSpace {
  id: string;
  name: string;
}

export interface SpaceLayoutProps {
  activeSpace: SpaceLayoutActiveSpace;
  navItems: SpaceNavItem[];
  /** Whether the Viewer may create or mutate content in this Space. */
  canMutateContent?: boolean;
  /** Server-rendered streamed slot; see ShareBarSlot. */
  shareBarSlot?: ReactNode;
  children?: ReactNode;
}

/**
 * Active Space main panel: header, Section tabs, content, and share bar.
 * Remounts with spaceId; the parent SpaceSidebarShell keeps the sidebar mounted.
 */
export function SpaceLayout({
  activeSpace,
  navItems,
  canMutateContent = false,
  shareBarSlot,
  children,
}: SpaceLayoutProps) {
  const pathname = usePathname();
  const openSidebar = useOpenSidebar();
  const current = navItems.find((item) => item.href === pathname);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[720px] overflow-x-hidden px-4 py-5 pb-16 sm:px-6 sm:py-6">
      <div className="mb-5 flex min-w-0 items-start justify-between gap-3 sm:gap-4">
        <header className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
            <span className="truncate">Active Space · {activeSpace.name}</span>
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[0.8rem] font-semibold transition-colors hover:border-muted hover:bg-panel/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          onClick={openSidebar}
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

      <div className="mb-4 flex min-w-0 items-end gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
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
  );
}
