import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { section, space, spaceMember } from "@/lib/db/schema";
import {
  DEFAULT_SPACE_TIMEZONE,
  createSpaceWithSystemSections,
} from "@/lib/db/seed";
import { PERSONAL_SPACE_NAME, ensurePersonalSpace } from "@/lib/onboarding";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("ensurePersonalSpace", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("gives a first-time user a Personal Space with Daily and Monthlies", async () => {
    const user = await createUser();

    const result = await ensurePersonalSpace(testDb, {
      userId: user.id,
      timezone: "America/Chicago",
    });

    expect(result.created).toBe(true);

    const [created] = await testDb
      .select()
      .from(space)
      .where(eq(space.id, result.spaceId));
    expect(created.name).toBe(PERSONAL_SPACE_NAME);
    expect(created.isPersonal).toBe(true);
    expect(created.timezone).toBe("America/Chicago");
    expect(created.createdBy).toBe(user.id);

    const sections = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, result.spaceId))
      .orderBy(section.sortOrder);
    expect(sections.map((s) => s.kind)).toEqual(["daily", "monthlies"]);
    expect(sections.every((s) => s.isSystem)).toBe(true);

    const members = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, result.spaceId));
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(user.id);
    expect(members[0].role).toBe("owner");
  });

  it("falls back to the default zone when the creator's is unknown", async () => {
    const user = await createUser();

    const { spaceId } = await ensurePersonalSpace(testDb, { userId: user.id });

    const [created] = await testDb
      .select()
      .from(space)
      .where(eq(space.id, spaceId));
    expect(created.timezone).toBe(DEFAULT_SPACE_TIMEZONE);
  });

  it("does not duplicate the Space or its Sections on later logins", async () => {
    const user = await createUser();

    const first = await ensurePersonalSpace(testDb, {
      userId: user.id,
      timezone: "Europe/Berlin",
    });
    const second = await ensurePersonalSpace(testDb, {
      userId: user.id,
      timezone: "Asia/Tokyo",
    });

    expect(second).toEqual({ spaceId: first.spaceId, created: false });

    const spaces = await testDb.select().from(space);
    expect(spaces).toHaveLength(1);
    // The zone belongs to the Space, so a later login does not rewrite it.
    expect(spaces[0].timezone).toBe("Europe/Berlin");

    const sections = await testDb.select().from(section);
    expect(sections).toHaveLength(2);
  });

  it("keeps the extra Spaces a user creates out of the way", async () => {
    const user = await createUser();
    const personal = await ensurePersonalSpace(testDb, { userId: user.id });

    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: user.id,
    });

    const again = await ensurePersonalSpace(testDb, { userId: user.id });
    expect(again.spaceId).toBe(personal.spaceId);
    expect(again.spaceId).not.toBe(home.space.id);
  });

  it("lets the database reject a second Personal Space for the same creator", async () => {
    const user = await createUser();
    await ensurePersonalSpace(testDb, { userId: user.id });

    await expect(
      createSpaceWithSystemSections(testDb, {
        name: PERSONAL_SPACE_NAME,
        ownerUserId: user.id,
        isPersonal: true,
      }),
    ).rejects.toThrow();
  });

  it("still onboards a user who was invited to someone else's Space first", async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const shared = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: shared.space.id,
      userId: invitee.id,
      role: "read-only",
    });

    const result = await ensurePersonalSpace(testDb, { userId: invitee.id });

    expect(result.created).toBe(true);
    expect(result.spaceId).not.toBe(shared.space.id);
  });
});
