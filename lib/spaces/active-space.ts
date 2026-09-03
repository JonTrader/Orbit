import { cache } from "react";

import type { section } from "@/lib/db/schema";

import {
  getSpaceLayoutData,
  type SpaceMemberPreview,
  type SpaceViewer,
} from "./viewer";

export type { SpaceMemberPreview };

export interface ActiveSpace {
  spaceId: string;
  viewer: SpaceViewer;
  sections: (typeof section.$inferSelect)[];
  /** ShareBar member preview from the layout query (not listMembers). */
  members: SpaceMemberPreview[];
}

/**
 * Active Space facade for RSC views: one memoised layout load per render pass
 * (Viewer, Sections, ShareBar member preview). Layout and pages call this;
 * getSpaceLayoutData owns the SQL.
 */
export const getActiveSpace = cache(
  async (spaceId: string): Promise<ActiveSpace> => {
    const { viewer, sections, members } = await getSpaceLayoutData(spaceId);
    return { spaceId, viewer, sections, members };
  },
);
