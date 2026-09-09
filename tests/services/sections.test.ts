import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";
import {
  createCustomSection,
  deleteCustomSection,
  getSectionForMember,
  listSections,
  renameSection,
  reorderCustomSections,
} from "@/lib/services/sections";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Section services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
    ]);

    return { owner, editor, readOnly, ...seeded };
  }

  it("lists system Sections first and allows read-only Members to read", async () => {
    const { space, editor, readOnly } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Errands",
      kind: "tasks",
    });

    await expect(
      listSections(testDb, { userId: readOnly.id, spaceId: space.id }),
    ).resolves.toMatchObject([
      { kind: "daily", isSystem: true },
      { kind: "monthlies", isSystem: true },
      { id: custom.id, name: "Errands", isSystem: false },
    ]);
  });

  it("rejects non-member reads and cross-Space Section lookups", async () => {
    const { space, sections, editor } = await seedSpace();
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const otherOwner = await createUser({ email: "other-owner@orbit.test" });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: other.space.id,
      userId: editor.id,
      role: "editor",
    });
    const otherCustom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      name: "Other Errands",
      kind: "tasks",
    });

    await expect(
      listSections(testDb, { userId: outsider.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      getSectionForMember(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: otherCustom.id,
      }),
    ).rejects.toMatchObject({ code: "SECTION_NOT_FOUND" });
    await expect(
      getSectionForMember(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
      }),
    ).resolves.toMatchObject({ id: sections.daily.id, kind: "daily" });
  });

  it("creates custom Sections for Editors and assigns custom sort order", async () => {
    const { space, editor } = await seedSpace();

    const tasks = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: " Errands ",
      kind: "tasks",
    });
    const notes = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Ideas",
      kind: "notes",
    });
    const mixed = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Kitchen",
      kind: "mixed",
    });

    expect(tasks).toMatchObject({ name: "Errands", kind: "tasks", sortOrder: 2 });
    expect(notes.sortOrder).toBe(3);
    expect(mixed.sortOrder).toBe(4);
  });

  it("rejects read-only and system-kind custom Section creation", async () => {
    const { space, editor, readOnly } = await seedSpace();

    await expect(
      createCustomSection(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        name: "Nope",
        kind: "tasks",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });

    await expect(
      createCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        name: "Sneaky Daily",
        kind: "daily" as never,
      }),
    ).rejects.toMatchObject({ code: "INVALID_KIND" });

    await expect(
      createCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        name: "",
        kind: "tasks",
      }),
    ).rejects.toMatchObject({ code: "INVALID_NAME" });
  });

  it("renames custom Sections but never system Sections", async () => {
    const { space, editor, sections } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Old name",
      kind: "mixed",
    });

    const renamed = await renameSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: custom.id,
      name: " New name ",
    });
    expect(renamed.name).toBe("New name");

    for (const sectionId of [sections.daily.id, sections.monthlies.id]) {
      await expect(
        renameSection(testDb, {
          userId: editor.id,
          spaceId: space.id,
          sectionId,
          name: "Changed system name",
        }),
      ).rejects.toMatchObject({ code: "SYSTEM_SECTION" });
    }
  });

  it("reorders every custom Section while keeping system Sections fixed", async () => {
    const { space, editor, sections } = await seedSpace();
    const first = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "First",
      kind: "tasks",
    });
    const second = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Second",
      kind: "notes",
    });
    const third = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Third",
      kind: "mixed",
    });

    await reorderCustomSections(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionIds: [third.id, first.id, second.id],
    });

    await expect(listSections(testDb, { userId: editor.id, spaceId: space.id })).resolves.toMatchObject([
      { id: sections.daily.id, sortOrder: 0 },
      { id: sections.monthlies.id, sortOrder: 1 },
      { id: third.id, sortOrder: 2 },
      { id: first.id, sortOrder: 3 },
      { id: second.id, sortOrder: 4 },
    ]);

    await expect(
      reorderCustomSections(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionIds: [third.id, sections.daily.id, first.id, second.id],
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_SECTION" });
    await expect(
      reorderCustomSections(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionIds: [third.id, first.id],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REORDER" });
    await expect(
      reorderCustomSections(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionIds: [third.id, first.id, first.id],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REORDER" });
  });

  it("rejects an empty reorder when custom Sections exist", async () => {
    const { space, editor } = await seedSpace();
    await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Errands",
      kind: "tasks",
    });

    await expect(
      reorderCustomSections(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionIds: [],
      }),
    ).rejects.toMatchObject({ code: "INVALID_REORDER" });
  });

  it("rejects custom Section mutations by read-only Members", async () => {
    const { space, editor, readOnly } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Errands",
      kind: "tasks",
    });

    await expect(
      renameSection(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionId: custom.id,
        name: "Nope",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      reorderCustomSections(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionIds: [custom.id],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      deleteCustomSection(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionId: custom.id,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
  });

  it("deletes custom Sections but blocks system Section deletion", async () => {
    const { space, editor, sections } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Temporary",
      kind: "tasks",
    });

    await expect(
      deleteCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: custom.id,
      }),
    ).resolves.toMatchObject({ id: custom.id });
    await expect(
      testDb.select().from(section).where(eq(section.id, custom.id)),
    ).resolves.toHaveLength(0);

    for (const sectionId of [sections.daily.id, sections.monthlies.id]) {
      await expect(
        deleteCustomSection(testDb, {
          userId: editor.id,
          spaceId: space.id,
          sectionId,
        }),
      ).rejects.toMatchObject({ code: "SYSTEM_SECTION" });
    }
  });

  it("refreshes updated_at through the database trigger", async () => {
    const { space, editor } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Ideas",
      kind: "notes",
    });

    const [updated] = await testDb
      .update(section)
      .set({ name: "Updated directly", updatedAt: new Date("2000-01-01T00:00:00Z") })
      .where(eq(section.id, custom.id))
      .returning();

    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      new Date("2000-01-01T00:00:00Z").getTime(),
    );
    expect(updated.name).toBe("Updated directly");
    expect(updated.spaceId).toBe(space.id);
  });
});
