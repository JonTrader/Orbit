import "../setup/api-mocks";
import "../setup/action-mocks";

import { SPACE_LAYOUT_PATTERN } from "@/lib/space-paths";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createSection,
  deleteSection,
  renameSection,
  reorderSections,
} from "@/lib/actions/sections";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededSpace {
  ownerId: string;
  editorId: string;
  readOnlyId: string;
  outsiderId: string;
  spaceId: string;
  dailyId: string;
  monthliesId: string;
  errandsId: string;
  ideasId: string;
}

async function seedSpace(): Promise<SeededSpace> {
  const owner = await createUser({ email: "owner@orbit.test" });
  const editor = await createUser({ email: "editor@orbit.test" });
  const readOnly = await createUser({ email: "read-only@orbit.test" });
  const outsider = await createUser({ email: "outsider@orbit.test" });
  const seeded = await createSpaceWithSystemSections(testDb, {
    name: "Home",
    ownerUserId: owner.id,
  });

  await testDb.insert(spaceMember).values([
    { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
    { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
  ]);

  const [errands, ideas] = await testDb
    .insert(section)
    .values([
      {
        spaceId: seeded.space.id,
        name: "Errands",
        kind: "tasks",
        sortOrder: 2,
      },
      {
        spaceId: seeded.space.id,
        name: "Ideas",
        kind: "notes",
        sortOrder: 3,
      },
    ])
    .returning();

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
    dailyId: seeded.sections.daily.id,
    monthliesId: seeded.sections.monthlies.id,
    errandsId: errands.id,
    ideasId: ideas.id,
  };
}

describe("section actions", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  describe("createSection", () => {
    it("creates a custom tasks Section after the existing Sections", async () => {
      const s = await seedSpace();
      authenticateAs(s.editorId);

      const result = await createSection({
        spaceId: s.spaceId,
        name: "  Shopping  ",
        kind: "mixed",
      });

      if (!result.ok) {
        throw new Error("Expected a created Section");
      }
      expect(result.data.name).toBe("Shopping");
      expect(result.data.kind).toBe("mixed");
      expect(result.data.isSystem).toBe(false);
      expect(result.data.sortOrder).toBe(4);
      expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACE_LAYOUT_PATTERN, "layout");
    });

    it("rejects an unknown kind as a validation error", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await createSection({
        spaceId: s.spaceId,
        name: "Daily clone",
        kind: "daily",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("rejects an empty name as a validation error", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await createSection({
        spaceId: s.spaceId,
        name: "   ",
        kind: "tasks",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("renameSection", () => {
    it("renames a custom Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await renameSection({
        spaceId: s.spaceId,
        sectionId: s.errandsId,
        name: "Chores",
      });

      if (!result.ok) {
        throw new Error("Expected a renamed Section");
      }
      expect(result.data.name).toBe("Chores");
      expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    });

    it("rejects renaming a system Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await renameSection({
        spaceId: s.spaceId,
        sectionId: s.dailyId,
        name: "Today",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SYSTEM_SECTION");
      }
      const [daily] = await testDb
        .select()
        .from(section)
        .where(eq(section.id, s.dailyId));
      expect(daily.name).toBe("Daily");
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });
  });

  describe("reorderSections", () => {
    it("reorders custom Sections and keeps system Sections at the top", async () => {
      const s = await seedSpace();
      authenticateAs(s.editorId);

      const result = await reorderSections({
        spaceId: s.spaceId,
        sectionIds: [s.ideasId, s.errandsId],
      });

      if (!result.ok) {
        throw new Error("Expected an ordered Section list");
      }
      expect(result.data.map((row) => row.id)).toEqual([
        s.dailyId,
        s.monthliesId,
        s.ideasId,
        s.errandsId,
      ]);
      expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    });

    it("rejects a reorder that includes a system Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await reorderSections({
        spaceId: s.spaceId,
        sectionIds: [s.dailyId, s.errandsId, s.ideasId],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SYSTEM_SECTION");
      }
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("rejects a reorder that omits or duplicates a custom Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const omitted = await reorderSections({
        spaceId: s.spaceId,
        sectionIds: [s.errandsId],
      });
      const duplicated = await reorderSections({
        spaceId: s.spaceId,
        sectionIds: [s.errandsId, s.errandsId, s.ideasId],
      });

      for (const result of [omitted, duplicated]) {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_REORDER");
        }
      }
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });
  });

  describe("deleteSection", () => {
    it("deletes a custom Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await deleteSection({
        spaceId: s.spaceId,
        sectionId: s.ideasId,
      });

      if (!result.ok) {
        throw new Error("Expected a deleted Section");
      }
      expect(result.data.id).toBe(s.ideasId);
      const rows = await testDb.select().from(section);
      expect(rows.map((row) => row.id)).not.toContain(s.ideasId);
      expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    });

    it("rejects deleting a system Section", async () => {
      const s = await seedSpace();
      authenticateAs(s.ownerId);

      const result = await deleteSection({
        spaceId: s.spaceId,
        sectionId: s.monthliesId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SYSTEM_SECTION");
      }
      const rows = await testDb.select().from(section);
      expect(rows.map((row) => row.id)).toContain(s.monthliesId);
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });
  });

  it("blocks read-only Members from every Section mutation", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const created = await createSection({
      spaceId: s.spaceId,
      name: "Nope",
      kind: "tasks",
    });
    const renamed = await renameSection({
      spaceId: s.spaceId,
      sectionId: s.errandsId,
      name: "Nope",
    });
    const reordered = await reorderSections({
      spaceId: s.spaceId,
      sectionIds: [s.ideasId, s.errandsId],
    });
    const deleted = await deleteSection({
      spaceId: s.spaceId,
      sectionId: s.errandsId,
    });

    for (const result of [created, renamed, reordered, deleted]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INSUFFICIENT_ROLE");
      }
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedSpace();
    authenticateAs(s.outsiderId);

    const result = await createSection({
      spaceId: s.spaceId,
      name: "Nope",
      kind: "tasks",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
