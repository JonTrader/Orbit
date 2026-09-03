"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SpaceDirectoryEntry } from "@/lib/services/spaces";
import { SPACES_PATH, spaceSectionPath } from "@/lib/spaces/paths";

import { CreateSpaceDialog } from "./CreateSpaceDialog";

export interface SpacesDirectoryProps {
  entries: SpaceDirectoryEntry[];
  /** True when `/spaces?new=space` asked to open the create dialog. */
  openCreate: boolean;
}

function roleLabel(role: SpaceDirectoryEntry["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  return "Read-only";
}

function memberLabel(count: number): string {
  return count === 1 ? "1 Member" : `${count} Members`;
}

function spacesCountLabel(visible: number, total: number): string {
  const unit = total === 1 ? "Space" : "Spaces";
  if (visible === total) {
    return `${total} ${unit}`;
  }
  return `${visible} of ${total} ${unit}`;
}

/**
 * Membership-scoped all-Spaces directory: filterable list with role, Member
 * count, and timezone metadata, plus New Space via CreateSpaceDialog (header
 * button or `?new=space` deep link).
 */
export function SpacesDirectory({ entries, openCreate }: SpacesDirectoryProps) {
  const router = useRouter();
  // Deep link drives open via prop; the header button uses local state only.
  const [localOpen, setLocalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dialogOpen = openCreate || localOpen;

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? entries.filter((entry) =>
        entry.name.toLowerCase().includes(normalizedQuery),
      )
    : entries;

  function closeDialog() {
    setLocalOpen(false);
    if (openCreate) {
      router.replace(SPACES_PATH);
    }
  }

  const total = entries.length;
  const visible = filtered.length;
  const hasFilter = normalizedQuery.length > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-accent">
            Directory
          </p>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-ink">
            Spaces
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setLocalOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-[0.7rem] py-[0.42rem] text-[0.78rem] font-semibold text-ink transition-colors hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-[0.85rem]"
            aria-hidden="true"
          >
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          New Space
        </button>
      </div>

      {total === 0 ? (
        <div className="overflow-hidden rounded border border-line bg-panel px-4 py-10 text-center">
          <p className="text-[0.95rem] font-medium text-ink">No Spaces yet</p>
          <p className="mt-1 text-[0.85rem] text-muted">
            Create a Space to get started.
          </p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
              Filter
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name"
              autoComplete="off"
              className="w-full rounded border border-line bg-panel px-3 py-2 text-[0.92rem] text-ink outline-none placeholder:text-muted placeholder:opacity-75 focus:border-accent"
            />
          </label>

          <div className="overflow-hidden rounded border border-line bg-panel">
            <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
              {spacesCountLabel(visible, total)}
            </div>

            {visible === 0 && hasFilter ? (
              <div className="border-t border-line px-4 py-10 text-center">
                <p className="text-[0.95rem] font-medium text-ink">
                  No matching Spaces
                </p>
                <p className="mt-1 text-[0.85rem] text-muted">
                  Try a different name, or clear the filter.
                </p>
              </div>
            ) : (
              <ul className="border-t border-line">
                {filtered.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 border-t border-line px-4 py-3 transition-colors first:border-t-0 hover:bg-(--row-hover) sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.95rem] font-medium text-ink">
                        {entry.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                        <span>{roleLabel(entry.role)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{memberLabel(entry.memberCount)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="normal-case tracking-normal">
                          {entry.timezone}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={spaceSectionPath(entry.id, "upcoming")}
                      className="shrink-0 pt-0.5 font-mono text-[0.72rem] uppercase tracking-wider text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:pt-0"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {dialogOpen ? <CreateSpaceDialog onClose={closeDialog} /> : null}
    </div>
  );
}
