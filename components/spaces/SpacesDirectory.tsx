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

/**
 * All-Spaces directory shell with a New Space entry point. Search/filter
 * polish lands in a later step; creation opens CreateSpaceDialog from the
 * header button or the `?new=space` deep link.
 */
export function SpacesDirectory({ entries, openCreate }: SpacesDirectoryProps) {
  const router = useRouter();
  // Deep link drives open via prop; the header button uses local state only.
  const [localOpen, setLocalOpen] = useState(false);
  const dialogOpen = openCreate || localOpen;

  function closeDialog() {
    setLocalOpen(false);
    if (openCreate) {
      router.replace(SPACES_PATH);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Spaces</h1>
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

      {entries.length === 0 ? (
        <div className="overflow-hidden rounded border border-line bg-panel px-4 py-10 text-center text-[0.9rem] text-muted">
          No Spaces yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-line bg-panel">
          <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
            {entries.length} {entries.length === 1 ? "Space" : "Spaces"}
          </div>
          <ul className="border-t border-line">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.95rem] font-medium text-ink">
                    {entry.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                    {roleLabel(entry.role)} · {entry.memberCount}{" "}
                    {entry.memberCount === 1 ? "Member" : "Members"} ·{" "}
                    {entry.timezone}
                  </div>
                </div>
                <Link
                  href={spaceSectionPath(entry.id, "upcoming")}
                  className="shrink-0 pt-0.5 font-mono text-[0.72rem] uppercase tracking-wider text-muted hover:text-ink"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialogOpen ? <CreateSpaceDialog onClose={closeDialog} /> : null}
    </div>
  );
}
