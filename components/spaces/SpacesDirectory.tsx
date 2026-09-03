"use client";

import Link from "next/link";

import type { SpaceDirectoryEntry } from "@/lib/services/spaces";
import { spaceSectionPath } from "@/lib/spaces/paths";

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
 * All-Spaces directory shell. Step 2 ships a readable membership list;
 * search/filter polish and CreateSpaceDialog land in later steps.
 */
export function SpacesDirectory({ entries, openCreate }: SpacesDirectoryProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Spaces</h1>
        {openCreate ? (
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
            New Space (dialog next)
          </p>
        ) : null}
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
    </div>
  );
}
