import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  reopenTask,
  TaskError,
  toggleTask,
  updateTask,
} from "@/lib/services/tasks";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Task services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const assignee = await createUser({ email: "assignee@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
      { spaceId: seeded.space.id, userId: assignee.id, role: "read-only" },
    ]);
    const [customTasks] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Errands",
        kind: "tasks",
        sortOrder: 2,
      })
      .returning();
    const [mixed] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Home",
        kind: "mixed",
        sortOrder: 3,
      })
      .returning();
    const [notes] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Ideas",
        kind: "notes",
        sortOrder: 4,
      })
      .returning();

    return {
      owner,
      editor,
      readOnly,
      assignee,
      outsider,
      ...seeded,
      customTasks,
      mixed,
      notes,
    };
  }

  it("creates, lists, gets, updates, and deletes Tasks", async () => {
    const { space, sections, editor, readOnly, assignee } = await seedSpace();

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: " Take out recycling ",
      dueOn: "2026-08-12",
      assigneeId: assignee.id,
    });

    expect(created).toMatchObject({
      sectionId: sections.daily.id,
      sectionKind: "daily",
      title: "Take out recycling",
      dueOn: "2026-08-12",
      assigneeId: assignee.id,
      createdBy: editor.id,
    });
    await expect(listTasks(testDb, { userId: readOnly.id, spaceId: space.id })).resolves.toMatchObject([
      { id: created.id, title: "Take out recycling" },
    ]);
    await expect(
      getTask(testDb, { userId: readOnly.id, spaceId: space.id, taskId: created.id }),
    ).resolves.toMatchObject({ id: created.id });

    const updated = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "Recycling",
      dueOn: null,
      assigneeId: null,
    });
    expect(updated).toMatchObject({ title: "Recycling", dueOn: null, assigneeId: null });

    await expect(
      deleteTask(testDb, { userId: editor.id, spaceId: space.id, taskId: created.id }),
    ).resolves.toMatchObject({ id: created.id });
    await expect(
      getTask(testDb, { userId: editor.id, spaceId: space.id, taskId: created.id }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("allows Tasks in Daily, custom tasks, and mixed Sections only", async () => {
    const { space, sections, editor, customTasks, mixed, notes } = await seedSpace();

    for (const target of [sections.daily, customTasks, mixed]) {
      await expect(
        createTask(testDb, {
          userId: editor.id,
          spaceId: space.id,
          sectionId: target.id,
          title: `Task in ${target.name}`,
        }),
      ).resolves.toMatchObject({ sectionId: target.id, sectionKind: target.kind });
    }

    await expect(
      createTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: notes.id,
        title: "Not a note",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    await expect(
      createTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: "00000000-0000-0000-0000-000000000000",
        title: "Unknown Section",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });
  });

  it("completes and reopens Tasks without an automatic reset", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Stay completed",
    });

    const completed = await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.completedBy).toBe(editor.id);

    const stillCompleted = await getTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(stillCompleted.completedAt).toBeInstanceOf(Date);

    const reopened = await reopenTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedBy).toBeNull();
  });

  it("toggles a Task open and completed atomically", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Toggle me",
    });

    const completed = await toggleTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.completedBy).toBe(editor.id);

    const reopened = await toggleTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedBy).toBeNull();
  });

  it("reports TASK_NOT_FOUND from the write path for unknown Tasks", async () => {
    const { space, editor } = await seedSpace();
    const ghostTaskId = crypto.randomUUID();

    for (const mutate of [completeTask, reopenTask, toggleTask]) {
      await expect(
        mutate(testDb, {
          userId: editor.id,
          spaceId: space.id,
          taskId: ghostTaskId,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    }
  });

  it("accepts a prevalidated Section row and still rejects Task-incompatible ones", async () => {
    const { space, editor, customTasks, notes } = await seedSpace();

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: customTasks.id,
      section: customTasks,
      title: "Fast path",
    });
    expect(created).toMatchObject({
      sectionId: customTasks.id,
      sectionKind: "tasks",
    });

    // A resolved row that does not match sectionId is ignored; the service
    // re-queries and rejects the notes Section.
    await expect(
      createTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: notes.id,
        section: customTasks,
        title: "Mismatched",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });
  });

  it("moves Tasks among Daily and custom task Sections, never to Monthlies or notes", async () => {
    const { space, sections, editor, customTasks, mixed, notes } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Move me",
    });
    const [monthlies] = await testDb
      .select()
      .from(section)
      .where(eq(section.id, sections.monthlies.id));

    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
        targetSectionId: customTasks.id,
      }),
    ).resolves.toMatchObject({ sectionId: customTasks.id, sectionKind: "tasks" });
    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
        targetSectionId: mixed.id,
      }),
    ).resolves.toMatchObject({ sectionId: mixed.id, sectionKind: "mixed" });

    for (const target of [notes, monthlies]) {
      await expect(
        moveTask(testDb, {
          userId: editor.id,
          spaceId: space.id,
          taskId: created.id,
          targetSectionId: target.id,
        }),
      ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    }
  });

  it("denies Task mutations to read-only Members and cross-Space assignees", async () => {
    const { space, sections, editor, readOnly, outsider } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Protected",
    });

    for (const action of [
      () =>
        createTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          sectionId: sections.daily.id,
          title: "Nope",
        }),
      () =>
        updateTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
          title: "Nope",
        }),
      () =>
        completeTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
        }),
      () =>
        toggleTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
        }),
      () =>
        deleteTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
        }),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }

    await expect(
      updateTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
        assigneeId: outsider.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
  });

  it("rejects empty titles and empty updates", async () => {
    const { space, sections, editor } = await seedSpace();

    await expect(
      createTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
        title: " ",
      }),
    ).rejects.toBeInstanceOf(TaskError);

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "No changes",
    });
    await expect(
      updateTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_UPDATE" });
  });
});
