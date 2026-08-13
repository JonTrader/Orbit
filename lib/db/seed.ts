import type { OrbitDb } from "./client";
import { section, space, spaceMember } from "./schema";

/**
 * The system Sections every Space is created with, in nav order after
 * Upcoming. Daily holds Tasks, Monthlies holds Monthlies (ADR 0001).
 */
export const SYSTEM_SECTIONS = [
  { kind: "daily", name: "Daily", sortOrder: 0 },
  { kind: "monthlies", name: "Monthlies", sortOrder: 1 },
] as const;

/** Fallback when the creator's timezone is unknown (ADR 0003). */
export const DEFAULT_SPACE_TIMEZONE = "UTC";

export interface CreateSpaceInput {
  name: string;
  /** IANA zone; defaults to the creator's browser/OS zone at call sites. */
  timezone?: string;
  /** When given, becomes the Space Owner. */
  ownerUserId?: string;
  isPersonal?: boolean;
}

export type SeededSpace = {
  space: typeof space.$inferSelect;
  sections: {
    daily: typeof section.$inferSelect;
    monthlies: typeof section.$inferSelect;
  };
  member: typeof spaceMember.$inferSelect | null;
};

/**
 * Creates a Space with its Daily and Monthlies system Sections, and an Owner
 * membership when `ownerUserId` is given. No custom Sections are created.
 */
export async function createSpaceWithSystemSections(
  db: OrbitDb,
  input: CreateSpaceInput,
): Promise<SeededSpace> {
  const timezone = input.timezone ?? DEFAULT_SPACE_TIMEZONE;

  return db.transaction(async (tx) => {
    const [createdSpace] = await tx
      .insert(space)
      .values({
        name: input.name,
        timezone,
        isPersonal: input.isPersonal ?? false,
        createdBy: input.ownerUserId ?? null,
      })
      .returning();

    const createdSections = await tx
      .insert(section)
      .values(
        SYSTEM_SECTIONS.map((s) => ({
          spaceId: createdSpace.id,
          name: s.name,
          kind: s.kind,
          isSystem: true,
          sortOrder: s.sortOrder,
        })),
      )
      .returning();

    let member: typeof spaceMember.$inferSelect | null = null;
    if (input.ownerUserId) {
      [member] = await tx
        .insert(spaceMember)
        .values({
          spaceId: createdSpace.id,
          userId: input.ownerUserId,
          role: "owner",
        })
        .returning();
    }

    const daily = createdSections.find((s) => s.kind === "daily");
    const monthlies = createdSections.find((s) => s.kind === "monthlies");
    if (!daily || !monthlies) {
      throw new Error("Seed failed to create both system Sections");
    }

    return { space: createdSpace, sections: { daily, monthlies }, member };
  });
}
