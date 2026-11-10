import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, note, section, spaceMember, task } from "@/lib/db/schema";
import { createNote } from "@/lib/services/notes";
import {
  createCustomSection,
  deleteCustomSection,
  getSectionForMember,
  listSections,
  renameSection,
  reorderCustomSections,
} from "@/lib/services/sections";
import { createTask } from "@/lib/services/tasks";

import { testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Section services", () => {
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

  async function activityFor(entityId: string) {
    return testDb
      .select()
      .from(activity)
      .where(eq(activity.entityId, entityId));
  }

  function addedActivity<T extends { id: string }>(before: T[], after: T[]) {
    const seen = new Set(before.map((row) => row.id));
    return after.filter((row) => !seen.has(row.id));
  }

  async function activityIds(spaceId: string) {
    const rows = await testDb
      .select({ id: activity.id })
      .from(activity)
      .where(eq(activity.spaceId, spaceId));
    return rows.map((row) => row.id).sort();
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

  it("records created and updated Section Activity and skips an identical rename", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: " Errands ",
      kind: "tasks",
    });

    const createdRows = await activityFor(created.id);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "section",
      entityId: created.id,
      action: "created",
      period: null,
    });
    expect(createdRows[0]?.details).toEqual({ title: "Errands" });

    const renamed = await renameSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: created.id,
      name: " Shopping ",
    });
    expect(renamed.name).toBe("Shopping");
    const renamedRows = addedActivity(createdRows, await activityFor(created.id));
    expect(renamedRows).toHaveLength(1);
    expect(renamedRows[0]).toMatchObject({
      action: "updated",
      actorUserId: editor.id,
      entityType: "section",
    });
    expect(renamedRows[0]?.details).toEqual({
      title: "Shopping",
      changes: { name: { from: "Errands", to: "Shopping" } },
    });

    const beforeSame = await activityFor(created.id);
    const same = await renameSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: created.id,
      name: "Shopping",
    });
    const padded = await renameSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: created.id,
      name: "  Shopping  ",
    });
    expect(same.name).toBe("Shopping");
    expect(padded.name).toBe("Shopping");
    expect(await activityFor(created.id)).toEqual(beforeSame);

    const beforeDaily = await activityFor(sections.daily.id);
    await expect(
      renameSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
        name: "Changed system name",
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_SECTION" });
    await expect(
      deleteCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_SECTION" });
    expect(await activityFor(sections.daily.id)).toEqual(beforeDaily);
  });

  it("records cascaded deletes and nothing when custom Sections are reordered", async () => {
    const { space, editor } = await seedSpace();
    const kitchen = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Kitchen",
      kind: "mixed",
    });
    const chore = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: kitchen.id,
      title: "Mop",
    });
    const recipe = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: kitchen.id,
      title: "Recipes",
    });
    const pantry = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Pantry",
      kind: "notes",
    });

    const beforeReorder = await activityIds(space.id);
    await reorderCustomSections(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionIds: [pantry.id, kitchen.id],
    });
    expect(await activityIds(space.id)).toEqual(beforeReorder);
    await expect(
      listSections(testDb, { userId: editor.id, spaceId: space.id }),
    ).resolves.toMatchObject([
      { kind: "daily" },
      { kind: "monthlies" },
      { id: pantry.id, sortOrder: 2 },
      { id: kitchen.id, sortOrder: 3 },
    ]);

    await expect(
      deleteCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: kitchen.id,
      }),
    ).resolves.toMatchObject({ id: kitchen.id, name: "Kitchen" });

    expect(
      await testDb.select().from(section).where(eq(section.id, kitchen.id)),
    ).toEqual([]);
    expect(await testDb.select().from(task).where(eq(task.id, chore.id))).toEqual(
      [],
    );
    expect(await testDb.select().from(note).where(eq(note.id, recipe.id))).toEqual(
      [],
    );

    const deletedRows = (await testDb
      .select()
      .from(activity)
      .where(eq(activity.spaceId, space.id))
    ).filter((row) => row.action === "deleted");
    expect(deletedRows).toHaveLength(3);
    const byType = new Map(deletedRows.map((row) => [row.entityType, row]));
    expect(byType.get("task")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "task",
      entityId: chore.id,
      action: "deleted",
    });
    expect(byType.get("task")?.details).toEqual({
      title: "Mop",
      cause: "section_deleted",
      sectionName: "Kitchen",
    });
    expect(byType.get("note")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "note",
      entityId: recipe.id,
      action: "deleted",
    });
    expect(byType.get("note")?.details).toEqual({
      title: "Recipes",
      cause: "section_deleted",
      sectionName: "Kitchen",
    });
    expect(byType.get("section")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "section",
      entityId: kitchen.id,
      action: "deleted",
    });
    expect(byType.get("section")?.details).toEqual({ title: "Kitchen" });
    expect((await activityFor(chore.id)).map((row) => row.action).sort()).toEqual([
      "created",
      "deleted",
    ]);
    expect((await activityFor(recipe.id)).map((row) => row.action).sort()).toEqual([
      "created",
      "deleted",
    ]);

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
    const otherSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      name: "Other kitchen",
      kind: "mixed",
    });
    const otherTask = await createTask(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      sectionId: otherSection.id,
      title: "Other mop",
    });
    const otherBefore = await activityIds(other.space.id);
    await expect(
      deleteCustomSection(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: otherSection.id,
      }),
    ).rejects.toMatchObject({ code: "SECTION_NOT_FOUND" });
    expect(await activityIds(other.space.id)).toEqual(otherBefore);
    expect(
      await testDb.select().from(section).where(eq(section.id, otherSection.id)),
    ).toHaveLength(1);
    expect(
      await testDb.select().from(task).where(eq(task.id, otherTask.id)),
    ).toHaveLength(1);
    expect(
      (await activityFor(otherTask.id)).some((row) => row.action === "deleted"),
    ).toBe(false);
  });

  it("records nothing when a read-only Member mutates Sections", async () => {
    const { space, editor, readOnly } = await seedSpace();
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: space.id,
      name: "Errands",
      kind: "tasks",
    });
    const before = await activityIds(space.id);

    await expect(
      createCustomSection(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        name: "Nope",
        kind: "tasks",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
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

    expect(await activityIds(space.id)).toEqual(before);
    expect(
      await testDb.select().from(section).where(eq(section.id, custom.id)),
    ).toHaveLength(1);
  });
});
