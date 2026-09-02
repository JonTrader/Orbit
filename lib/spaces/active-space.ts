import { cache } from "react";

import type { section } from "@/lib/db/schema";

import { getSpaceSections, getSpaceViewer, type SpaceViewer } from "./viewer";

export interface ActiveSpace {
  spaceId: string;
  viewer: SpaceViewer;
  sections: (typeof section.$inferSelect)[];
}

/**
 * Active Space context for RSC views: Viewer plus Sections in one memoised
 * read per render pass. Layout and pages call this instead of getSpaceViewer
 * and getSpaceSections separately; React cache dedupes the underlying lookups.
 */
export const getActiveSpace = cache(
  async (spaceId: string): Promise<ActiveSpace> => {
    const [viewer, sections] = await Promise.all([
      getSpaceViewer(spaceId),
      getSpaceSections(spaceId),
    ]);

    return { spaceId, viewer, sections };
  },
);
