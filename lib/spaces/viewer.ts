import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { CREDENTIAL_PROVIDER_ID } from "@/lib/auth/access";
import { APP_PATH } from "@/lib/auth/paths";
import { requireVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  account,
  section,
  space,
  spaceMember,
  user,
  type SpaceRole,
} from "@/lib/db/schema";

export interface SpaceViewerCapabilities {
  /** Editor or Owner: compose, complete/reopen, Notes, custom Sections. */
  mutateContent: boolean;
  /** Owner only: invites, roles, removal, ownership transfer. */
  manageMembers: boolean;
  /** Email/password account: change-password page and sidebar link. */
  changePassword: boolean;
}

export function capabilitiesFor(
  role: SpaceRole,
  changePassword: boolean,
): SpaceViewerCapabilities {
  return {
    mutateContent: role !== "read-only",
    manageMembers: role === "owner",
    changePassword,
  };
}

export interface SpaceViewerUser {
  name: string;
  email: string;
}

export interface SpaceViewer {
  /** The Viewer's user id, for service calls that still take it explicitly. */
  userId: string;
  /** Display identity from the session, so views never touch it separately. */
  user: SpaceViewerUser;
  space: typeof space.$inferSelect;
  role: SpaceRole;
  can: SpaceViewerCapabilities;
}

/** ShareBar / chrome preview of a Space Member (no email or image). */
export interface SpaceMemberPreview {
  userId: string;
  name: string;
  role: SpaceRole;
}

export interface SpaceLayoutData {
  viewer: SpaceViewer;
  sections: (typeof section.$inferSelect)[];
  members: SpaceMemberPreview[];
}

type SectionJson = {
  id: string;
  spaceId: string;
  name: string;
  kind: (typeof section.$inferSelect)["kind"];
  isSystem: boolean;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function parseSections(value: unknown): (typeof section.$inferSelect)[] {
  if (!Array.isArray(value)) return [];
  return (value as SectionJson[]).map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    kind: row.kind,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  }));
}

function parseMembers(value: unknown): SpaceMemberPreview[] {
  if (!Array.isArray(value)) return [];
  return value as SpaceMemberPreview[];
}

/**
 * One-query Active Space layout data: space + Viewer role + credential flag +
 * Sections + ShareBar member preview. Grouped into `{ viewer, sections,
 * members }` in app code. Prefer getActiveSpace in layouts/pages; this is the
 * SQL loader behind that facade.
 *
 * Failure modes: unknown Space → notFound(); non-member → redirect `/`;
 * unverified → session-guard redirect.
 */
export const getSpaceLayoutData = cache(
  async (spaceId: string): Promise<SpaceLayoutData> => {
    const session = await requireVerifiedSession();
    const db = getDb();
    const userId = session.user.id;

    const [row] = await db
      .select({
        ...getTableColumns(space),
        role: spaceMember.role,
        changePassword: sql<boolean>`exists (
          select 1 from ${account}
          where ${account.userId} = ${userId}
            and ${account.providerId} = ${CREDENTIAL_PROVIDER_ID}
        )`.mapWith(Boolean),
        sections: sql<SectionJson[]>`(
          select coalesce(
            json_agg(
              json_build_object(
                'id', ${section.id},
                'spaceId', ${section.spaceId},
                'name', ${section.name},
                'kind', ${section.kind},
                'isSystem', ${section.isSystem},
                'sortOrder', ${section.sortOrder},
                'createdAt', ${section.createdAt},
                'updatedAt', ${section.updatedAt}
              )
              order by ${section.isSystem} desc, ${section.sortOrder}, ${section.id}
            ),
            '[]'::json
          )
          from ${section}
          where ${section.spaceId} = ${space.id}
        )`,
        members: sql<SpaceMemberPreview[]>`(
          select coalesce(
            json_agg(
              json_build_object(
                'userId', ${spaceMember.userId},
                'name', ${user.name},
                'role', ${spaceMember.role}
              )
              order by ${spaceMember.createdAt}, ${spaceMember.id}
            ),
            '[]'::json
          )
          from ${spaceMember}
          inner join ${user} on ${user.id} = ${spaceMember.userId}
          where ${spaceMember.spaceId} = ${space.id}
        )`,
      })
      .from(space)
      .innerJoin(
        spaceMember,
        and(
          eq(spaceMember.spaceId, space.id),
          eq(spaceMember.userId, userId),
        ),
      )
      .where(eq(space.id, spaceId))
      .limit(1);

    if (!row) {
      const [found] = await db
        .select({ id: space.id })
        .from(space)
        .where(eq(space.id, spaceId))
        .limit(1);
      if (!found) notFound();
      redirect(APP_PATH);
    }

    const {
      role,
      changePassword,
      sections: sectionsJson,
      members: membersJson,
      ...spaceRow
    } = row;

    return {
      viewer: {
        userId,
        user: { name: session.user.name, email: session.user.email },
        space: spaceRow,
        role,
        can: capabilitiesFor(role, changePassword),
      },
      sections: parseSections(sectionsJson),
      members: parseMembers(membersJson),
    };
  },
);

/**
 * Resolves the Viewer of one Active Space. Delegates to getSpaceLayoutData so
 * callers share one SQL round trip with Sections and the ShareBar preview.
 */
export const getSpaceViewer = cache(
  async (spaceId: string): Promise<SpaceViewer> => {
    const layoutData = await getSpaceLayoutData(spaceId);
    return layoutData.viewer;
  },
);

/**
 * Lists the Active Space's Sections for the Viewer. Delegates to
 * getSpaceLayoutData (same round trip as the Viewer).
 */
export const getSpaceSections = cache(async (spaceId: string) => {
  const layoutData = await getSpaceLayoutData(spaceId);
  return layoutData.sections;
});
