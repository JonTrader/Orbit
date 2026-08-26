import { asc, eq } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb } from "@/lib/db/client";
import {
  DEFAULT_SPACE_TIMEZONE,
  createSpaceWithSystemSections,
} from "@/lib/db/seed";
import { space, spaceMember } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";
import { normalizeTimeZone } from "@/lib/timezone";

export type SpaceErrorCode =
  | "INVALID_TIMEZONE"
  | "LAST_SPACE"
  | "SPACE_NOT_FOUND";

export class SpaceError extends DomainError<SpaceErrorCode> {
  readonly name = "SpaceError";

  constructor(code: SpaceErrorCode, message: string) {
    super(code, message);
  }
}

export interface CreateSpaceServiceInput {
  userId: string;
  name: string;
  /** IANA zone; UTC is used when the creator does not provide one. */
  timezone?: string;
}

export interface SpaceAccessInput {
  userId: string;
  spaceId: string;
}

export interface UpdateSpaceTimezoneInput extends SpaceAccessInput {
  timezone: string;
}

/** Lists only Spaces where the caller is a Member, in creation order. */
export async function listSpaces(
  db: OrbitDb,
  userId: string,
): Promise<(typeof space.$inferSelect)[]> {
  const rows = await db
    .select({ space })
    .from(space)
    .innerJoin(spaceMember, eq(spaceMember.spaceId, space.id))
    .where(eq(spaceMember.userId, userId))
    .orderBy(asc(space.createdAt), asc(space.id));

  return rows.map((row) => row.space);
}

/** Gets a Space after confirming the caller is a Member of it. */
export async function getSpace(
  db: OrbitDb,
  input: SpaceAccessInput,
): Promise<typeof space.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  const [result] = await db
    .select()
    .from(space)
    .where(eq(space.id, input.spaceId))
    .limit(1);

  if (!result) {
    throw new SpaceError("SPACE_NOT_FOUND", "Space was not found");
  }

  return result;
}

/** Creates a Space with its system Sections and makes the caller its Owner. */
export async function createSpace(
  db: OrbitDb,
  input: CreateSpaceServiceInput,
): Promise<typeof space.$inferSelect> {
  const timezone = resolveTimeZone(input.timezone);
  const seeded = await createSpaceWithSystemSections(db, {
    name: input.name,
    timezone,
    ownerUserId: input.userId,
  });

  return seeded.space;
}

/** Updates the Space timezone. Only the Owner may change Space settings. */
export async function updateSpaceTimezone(
  db: OrbitDb,
  input: UpdateSpaceTimezoneInput,
): Promise<typeof space.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "owner" });
  const timezone = resolveTimeZone(input.timezone, true);

  const [updated] = await db
    .update(space)
    .set({ timezone })
    .where(eq(space.id, input.spaceId))
    .returning();

  if (!updated) {
    throw new SpaceError("SPACE_NOT_FOUND", "Space was not found");
  }

  return updated;
}

/**
 * Deletes a Space when the Owner has another Space to keep.
 *
 * The Owner's membership rows are locked while checking the guard so two
 * concurrent deletes cannot both pass a last-Space check for the same user.
 */
export async function deleteSpace(
  db: OrbitDb,
  input: SpaceAccessInput,
): Promise<typeof space.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "owner" });

  return db.transaction(async (tx) => {
    const memberships = await tx
      .select({ id: spaceMember.id })
      .from(spaceMember)
      .where(eq(spaceMember.userId, input.userId))
      .for("update");

    if (memberships.length <= 1) {
      throw new SpaceError(
        "LAST_SPACE",
        "The Owner cannot delete their last remaining Space",
      );
    }

    const [deleted] = await tx
      .delete(space)
      .where(eq(space.id, input.spaceId))
      .returning();

    if (!deleted) {
      throw new SpaceError("SPACE_NOT_FOUND", "Space was not found");
    }

    return deleted;
  });
}

function resolveTimeZone(
  timezone: string | undefined,
  required = false,
): string {
  const normalized = normalizeTimeZone(
    required ? timezone : timezone ?? DEFAULT_SPACE_TIMEZONE,
  );
  if (!normalized) {
    throw new SpaceError(
      "INVALID_TIMEZONE",
      "Space timezone must be a valid IANA timezone",
    );
  }
  return normalized;
}
