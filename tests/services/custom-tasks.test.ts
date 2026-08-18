import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";
import { createCustomSection } from "@/lib/services/sections";
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  moveTask,
  updateTask,
} from "@/lib/services/tasks";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("custom Section Task services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("supports CRUD and completion for Tasks in custom Sections", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: editor.id,
      role: "editor",
    });
    const custom = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Errands",
      kind: "tasks",
    });

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      sectionId: custom.id,
      title: "Pick up parcel",
    });
    expect(created.sectionKind).toBe("tasks");

    const updated = await updateTask(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      taskId: created.id,
      title: "Pick up package",
    });
    expect(updated.title).toBe("Pick up package");

    const completed = await completeTask(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      taskId: created.id,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);

    await expect(
      listTasks(testDb, {
        userId: editor.id,
        spaceId: seeded.space.id,
        sectionId: custom.id,
      }),
    ).resolves.toMatchObject([{ id: created.id, title: "Pick up package" }]);
    await expect(
      deleteTask(testDb, {
        userId: editor.id,
        spaceId: seeded.space.id,
        taskId: created.id,
      }),
    ).resolves.toMatchObject({ id: created.id });
  });

  it("moves custom Tasks only to other Task-capable custom Sections", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: editor.id,
      role: "editor",
    });
    const tasksSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Errands",
      kind: "tasks",
    });
    const mixedSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Home",
      kind: "mixed",
    });
    const notesSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Ideas",
      kind: "notes",
    });
    const task = await createTask(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      sectionId: tasksSection.id,
      title: "Moveable",
    });

    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: seeded.space.id,
        taskId: task.id,
        targetSectionId: mixedSection.id,
      }),
    ).resolves.toMatchObject({ sectionKind: "mixed" });
    for (const targetSectionId of [notesSection.id, seeded.sections.monthlies.id]) {
      await expect(
        moveTask(testDb, {
          userId: editor.id,
          spaceId: seeded.space.id,
          taskId: task.id,
          targetSectionId,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    }
  });
});
