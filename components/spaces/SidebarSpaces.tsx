import { getDb } from "@/lib/db/client";
import { spaceLayoutPath, spaceSectionPath } from "@/lib/spaces/paths";
import { listSpaces } from "@/lib/services/spaces";

import { SidebarNavLinks } from "./SidebarNavLinks";

interface SidebarSpacesProps {
  userId: string;
}

/** Placeholder matching the list's height while the query streams. */
export function SidebarSpacesSkeleton() {
  return (
    <div className="flex flex-col gap-0.5" aria-hidden>
      <div className="px-2 pb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted">
        Spaces
      </div>
      {[0, 1].map((row) => (
        <div
          key={row}
          className="ml-5 h-6 w-3/4 animate-pulse rounded bg-panel"
        />
      ))}
    </div>
  );
}

/**
 * The sidebar's Spaces list, streamed separately: only this block needs the
 * listSpaces query, so nothing else in the layout should wait for it.
 * Rendered inside <Suspense> by the Space layout and passed down as a plain
 * prop, because server components cannot live inside client-component trees.
 */
export async function SidebarSpaces({ userId }: SidebarSpacesProps) {
  const spaces = await listSpaces(getDb(), userId);

  return (
    <SidebarNavLinks
      title="Spaces"
      items={spaces.map((space) => ({
        key: space.id,
        href: spaceSectionPath(space.id, "upcoming"),
        label: space.name,
        // Stay highlighted on every section of the Space, not just Upcoming.
        activePrefix: spaceLayoutPath(space.id),
      }))}
    />
  );
}
