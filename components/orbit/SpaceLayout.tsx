"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth-paths";
import type { SpaceNavItem } from "@/lib/space-nav";
import { spaceSectionPath } from "@/lib/space-paths";

export interface SpaceLayoutUser {
  name: string;
  email: string;
  canChangePassword: boolean;
}

export interface SpaceLayoutSpace {
  id: string;
  name: string;
}

export interface SpaceLayoutProps {
  user?: SpaceLayoutUser;
  /** The Space every nested view is scoped to. */
  activeSpace: SpaceLayoutSpace;
  /** Every Space the user belongs to, in creation order. */
  spaces: SpaceLayoutSpace[];
  /** Nav entries in fixed order: Upcoming, Daily, Monthlies, customs. */
  navItems: SpaceNavItem[];
  children?: ReactNode;
}

export function SpaceLayout({
  user,
  activeSpace,
  spaces,
  navItems,
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

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[min(18rem,88vw)] flex-col gap-5 overflow-auto border-r border-line bg-[color-mix(in_srgb,var(--sidebar)_88%,white)] px-3.5 py-5 transition-transform duration-200 lg:sticky lg:w-auto lg:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-[8px_0_32px_rgba(28,25,23,0.08)]" : "-translate-x-[105%] lg:translate-x-0",
        ].join(" ")}
        aria-label="Spaces and sections"
      >
        <div className="px-1.5">
          <div className="text-[1.15rem] font-bold tracking-[-0.03em]">
            Or<span className="text-accent">bit</span>
          </div>
          <div className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-[0.07em] text-muted">
            Household agenda
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between px-2 pb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
            <span>Spaces</span>
            <span className="tracking-[0.04em] text-accent">View all</span>
          </div>
          {spaces.map((space) => {
            const active = space.id === activeSpace.id;
            return (
              <Link
                key={space.id}
                href={spaceSectionPath(space.id, "upcoming")}
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.875rem] font-medium",
                  active
                    ? "bg-panel font-semibold shadow-[inset_0_0_0_1px_var(--line)]"
                    : "hover:bg-panel/70",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <span
                  className={[
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-accent" : "bg-line",
                  ].join(" ")}
                />
                {space.name}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
            In this Space
          </div>
          {navItems.map((item) => {
            const active = item.href === pathname;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={[
                  "w-full rounded py-1.5 pl-5 pr-2 text-left text-[0.82rem]",
                  active
                    ? "bg-panel font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                    : "font-normal text-muted hover:bg-panel/70",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-1 border-t border-line px-1.5 pt-3">
          <button
            type="button"
            className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
          >
            Browse all Spaces
          </button>
          <button
            type="button"
            className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
          >
            New Space…
          </button>
          {user ? (
            <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
              <div className="px-2 text-[0.78rem] font-medium">{user.name}</div>
              <div className="truncate px-2 font-mono text-[0.62rem] text-muted">
                {user.email}
              </div>
              {user.canChangePassword ? (
                <Link
                  href={CHANGE_PASSWORD_PATH}
                  className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
                >
                  Change password
                </Link>
              ) : null}
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[720px] px-4 py-5 pb-16 sm:px-6 sm:py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <header>
            <div className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
              Active Space · {activeSpace.name}
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
            className="inline-flex rounded border border-line bg-panel px-2.5 py-1.5 text-[0.8rem] font-semibold lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            Spaces
          </button>
        </div>

        {children}
      </main>
    </div>
  );
}
