import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SPACE_TIMEZONE,
  createSpaceWithSystemSections,
} from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("seed helper", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("creates a Space with a timezone and both system Sections, and no customs", async () => {
    const owner = await createUser();
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });

    expect(seeded.space.timezone).toBe("America/Chicago");

    const sections = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, seeded.space.id))
      .orderBy(section.sortOrder);

    expect(sections.map((s) => s.kind)).toEqual(["daily", "monthlies"]);
    expect(sections.map((s) => s.name)).toEqual(["Daily", "Monthlies"]);
    expect(sections.every((s) => s.isSystem)).toBe(true);
    expect(sections.map((s) => s.sortOrder)).toEqual([0, 1]);
    expect(sections.filter((s) => !s.isSystem)).toHaveLength(0);
  });

  it("falls back to the default timezone", async () => {
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
    });
    expect(seeded.space.timezone).toBe(DEFAULT_SPACE_TIMEZONE);
  });

  it("makes the given user the Space Owner", async () => {
    const owner = await createUser();
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
      ownerUserId: owner.id,
      isPersonal: true,
    });

    const members = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, seeded.space.id));

    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
    expect(members[0].userId).toBe(owner.id);
    expect(seeded.space.isPersonal).toBe(true);
  });

  it("allows only one Owner per Space", async () => {
    const owner = await createUser();
    const other = await createUser();
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await expect(
      testDb
        .insert(spaceMember)
        .values({ spaceId: seeded.space.id, userId: other.id, role: "owner" }),
    ).rejects.toThrow();
  });

  it("allows only one Daily and one Monthlies per Space", async () => {
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
    });

    await expect(
      testDb.insert(section).values({
        spaceId: seeded.space.id,
        name: "Daily",
        kind: "daily",
        isSystem: true,
        sortOrder: 2,
      }),
    ).rejects.toThrow();
  });
});
