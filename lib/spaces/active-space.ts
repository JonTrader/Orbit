import { cache } from "react";

import type { section } from "@/lib/db/schema";

import {
  getSpaceLayoutData,
  type ReminderPreferencePreview,
  type SpaceMemberPreview,
  type SpaceViewer,
} from "./viewer";

export type { ReminderPreferencePreview, SpaceMemberPreview };

export interface ActiveSpace {
  spaceId: string;
  viewer: SpaceViewer;
  sections: (typeof section.$inferSelect)[];
  /** ShareBar member preview from the layout query (not listMembers). */
  members: SpaceMemberPreview[];
  /** Viewer's Reminder preference from the layout query. Defaults when no row exists. */
  reminder: ReminderPreferencePreview;
}

/**
 * Active Space facade for RSC views: one memoised layout load per render pass
 * (Viewer, Sections, ShareBar member preview, Reminder preference). Layout and
 * pages call this; getSpaceLayoutData owns the SQL.
 */
export const getActiveSpace = cache(
  async (spaceId: string): Promise<ActiveSpace> => {
    const { viewer, sections, members, reminder } =
      await getSpaceLayoutData(spaceId);
    return { spaceId, viewer, sections, members, reminder };
  },
);
