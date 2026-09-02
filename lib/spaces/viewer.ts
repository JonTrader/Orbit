import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { hasCredentialAccount } from "@/lib/auth/access";
import { APP_PATH } from "@/lib/auth/paths";
import { getDb } from "@/lib/db/client";
import { space, type SpaceRole } from "@/lib/db/schema";
import { fetchSections } from "@/lib/spaces/queries/fetch-sections";
import { requireVerifiedSession } from "@/lib/auth/session";

import { findMembership } from "./membership";

export interface SpaceViewerCapabilities {
  /** Editor or Owner: compose, complete/reopen, Notes, custom Sections. */
  mutateContent: boolean;
  /** Owner only: invites, roles, removal, ownership transfer. */
  manageMembers: boolean;
  /** Email/password account: change-password page and sidebar link. */
  changePassword: boolean;
}

function capabilitiesFor(
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

/**
 * Resolves the Viewer of one Active Space: verified session, membership, and
 * role-derived capabilities in a single memoised read per render pass.
 *
 * Failure modes are owned here so views never branch on them. An unknown or
 * deleted Space is a 404; a Space the caller does not belong to redirects to
 * the app root (the Active Space picker); unauthenticated or unverified
 * callers get the session guard's redirect.
 *
 * Memoised via React cache so a request's layout and page share one lookup;
 * services keep their own membership checks for the API boundary.
 */
export const getSpaceViewer = cache(
  async (spaceId: string): Promise<SpaceViewer> => {
    const session = await requireVerifiedSession();
    const db = getDb();
    const userId = session.user.id;

    const [membership, activeSpace, changePassword] = await Promise.all([
      findMembership(db, userId, spaceId),
      db.select().from(space).where(eq(space.id, spaceId)).limit(1),
      hasCredentialAccount(db, userId),
    ]);

    if (!activeSpace[0]) notFound();
    if (!membership) redirect(APP_PATH);

    return {
      userId,
      user: { name: session.user.name, email: session.user.email },
      space: activeSpace[0],
      role: membership.role,
      can: capabilitiesFor(membership.role, changePassword),
    };
  },
);

/**
 * Lists the Active Space's Sections for the Viewer, memoised per render pass
 * so a request's layout and page share one query instead of each fetching the
 * same rows. Failure modes are the Viewer's (404 / root redirect).
 */
export const getSpaceSections = cache(async (spaceId: string) => {
  await getSpaceViewer(spaceId);
  return fetchSections(getDb(), spaceId);
});
