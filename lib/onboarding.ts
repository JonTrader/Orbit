import { and, eq } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { space } from "@/lib/db/schema";
import {
  DEFAULT_SPACE_TIMEZONE,
  createSpaceWithSystemSections,
} from "@/lib/db/seed";

export const PERSONAL_SPACE_NAME = "Personal";

export interface EnsurePersonalSpaceInput {
  userId: string;
  /** Creator's IANA zone; falls back to UTC when unknown (ADR 0003). */
  timezone?: string;
}

export interface PersonalSpaceResult {
  spaceId: string;
  created: boolean;
}

async function findPersonalSpaceId(
  db: OrbitDb,
  userId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: space.id })
    .from(space)
    .where(and(eq(space.createdBy, userId), eq(space.isPersonal, true)))
    .limit(1);
  return row?.id;
}

/**
 * Gives a user their Personal Space with Daily and Monthlies on first verified
 * login (spec §4). Safe to call on every request: a user has at most one.
 */
export async function ensurePersonalSpace(
  db: OrbitDb,
  input: EnsurePersonalSpaceInput,
): Promise<PersonalSpaceResult> {
  const existing = await findPersonalSpaceId(db, input.userId);
  if (existing) return { spaceId: existing, created: false };

  try {
    const seeded = await createSpaceWithSystemSections(db, {
      name: PERSONAL_SPACE_NAME,
      timezone: input.timezone ?? DEFAULT_SPACE_TIMEZONE,
      ownerUserId: input.userId,
      isPersonal: true,
    });
    return { spaceId: seeded.space.id, created: true };
  } catch (error) {
    // Concurrent first requests both try to create; the partial unique index
    // on space lets exactly one through and the loser adopts it.
    const raced = await findPersonalSpaceId(db, input.userId);
    if (raced) return { spaceId: raced, created: false };
    throw error;
  }
}
