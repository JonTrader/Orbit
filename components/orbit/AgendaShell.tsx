"use client";

import Link from "next/link";
import { useState } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth-paths";

const SECTIONS = [
  { id: "upcoming", label: "Upcoming", sub: "Monthlies and dated items in this Space." },
  { id: "daily", label: "Daily", sub: "Day-to-day to-dos for this Space." },
  { id: "monthlies", label: "Monthlies", sub: "Recurring monthly obligations." },
  { id: "shopping", label: "Shopping", sub: "Custom Section placeholder." },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const SPACES = [
  { id: "personal", name: "Personal", meta: "1" },
  { id: "home", name: "Home", meta: "3" },
] as const;

export interface AgendaShellUser {
  name: string;
  email: string;
}

export function AgendaShell({ user }: { user?: AgendaShellUser }) {
  const [activeSpaceId, setActiveSpaceId] = useState<(typeof SPACES)[number]["id"]>("personal");
  const [activeSection, setActiveSection] = useState<SectionId>("upcoming");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeSpace = SPACES.find((s) => s.id === activeSpaceId) ?? SPACES[0];
  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];
  const showCompose = activeSection !== "upcoming";

  function selectSection(id: SectionId) {
    setActiveSection(id);
    setSidebarOpen(false);
  }

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
          {SPACES.map((space) => {
            const active = space.id === activeSpaceId;
            return (
              <button
                key={space.id}
                type="button"
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.875rem] font-medium",
                  active
                    ? "bg-panel font-semibold shadow-[inset_0_0_0_1px_var(--line)]"
                    : "hover:bg-panel/70",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveSpaceId(space.id)}
              >
                <span
                  className={[
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-accent" : "bg-line",
                  ].join(" ")}
                />
                {space.name}
                <span className="ml-auto font-mono text-[0.65rem] text-muted">
                  {space.meta}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
            In this Space
          </div>
          {SECTIONS.map((item) => {
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                className={[
                  "w-full rounded py-1.5 pl-5 pr-2 text-left text-[0.82rem]",
                  active
                    ? "bg-panel font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                    : "font-normal text-muted hover:bg-panel/70",
                ].join(" ")}
                onClick={() => selectSection(item.id)}
              >
                {item.label}
              </button>
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
              <Link
                href={CHANGE_PASSWORD_PATH}
                className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
              >
                Change password
              </Link>
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
            <h1 className="text-[1.75rem] font-bold tracking-[-0.03em]">{section.label}</h1>
            <p className="mt-1 text-[0.95rem] text-muted">{section.sub}</p>
          </header>
          <button
            type="button"
            className="inline-flex rounded border border-line bg-panel px-2.5 py-1.5 text-[0.8rem] font-semibold lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            Spaces
          </button>
        </div>

        <div
          className="mb-4 flex flex-wrap gap-1 border-b border-line pb-0.5"
          role="tablist"
          aria-label="Sections"
        >
          {SECTIONS.map((item) => {
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  "mb-[-2px] border-b-2 px-3 py-2 text-[0.875rem] font-medium",
                  active
                    ? "border-accent text-ink"
                    : "border-transparent text-muted",
                ].join(" ")}
                onClick={() => selectSection(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
            {section.label}
          </div>
          <div className="border-t border-line px-4 py-10 text-center text-[0.9rem] text-muted">
            Nothing here yet. Data wiring comes in later phases.
          </div>
        </div>

        {showCompose ? (
          <div className="mt-3.5 flex gap-2">
            <input
              type="text"
              readOnly
              placeholder={`Add to ${section.label}…`}
              className="flex-1 rounded border border-line bg-panel px-3.5 py-2.5 text-base outline-none placeholder:text-muted/80"
              aria-label={`Add to ${section.label}`}
            />
            <button
              type="button"
              className="rounded bg-ink px-4 text-[0.85rem] font-semibold text-white"
            >
              Add
            </button>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded border border-dashed border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-4 py-3.5 text-[0.85rem]">
          <div>
            <strong className="font-semibold">{activeSpace.name}</strong>
            <span className="text-muted"> · share bar placeholder</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="grid size-6 place-items-center rounded-full bg-ink text-[0.65rem] font-bold text-white">
              Y
            </span>
            <em className="ml-1 text-[0.75rem] not-italic text-muted">+ Invite</em>
          </div>
        </div>
      </main>
    </div>
  );
}
