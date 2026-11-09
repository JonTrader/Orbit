import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, section, spaceMember, task } from "@/lib/db/schema";
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

import { testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Task services", () => {
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test", name: "Owner" });
    const editor = await createUser({ email: "editor@orbit.test", name: "Editor" });
    const readOnly = await createUser({
      email: "read-only@orbit.test",
      name: "Reader",
    });
    const assignee = await createUser({
      email: "assignee@orbit.test",
      name: "Assignee",
    });
    const outsider = await createUser({
      email: "outsider@orbit.test",
      name: "Outsider",
    });
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

  async function activityFor(entityId: string) {
    return testDb.select().from(activity).where(eq(activity.entityId, entityId));
  }

  function addedActivity<T extends { id: string }>(before: T[], after: T[]) {
    const seen = new Set(before.map((row) => row.id));
    return after.filter((row) => !seen.has(row.id));
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

  it("supports CRUD and completion for Tasks in custom Sections", async () => {
    const { space, editor, customTasks } = await seedSpace();

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: customTasks.id,
      title: "Pick up parcel",
    });
    expect(created.sectionKind).toBe("tasks");

    const updated = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "Pick up package",
    });
    expect(updated.title).toBe("Pick up package");

    const completed = await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(completed.completedAt).toBeInstanceOf(Date);

    await expect(
      listTasks(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: customTasks.id,
      }),
    ).resolves.toMatchObject([{ id: created.id, title: "Pick up package" }]);
    await expect(
      deleteTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
      }),
    ).resolves.toMatchObject({ id: created.id });
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
        sectionId: sections.monthlies.id,
        title: "Task in Monthlies",
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

  it("completes and reopens Tasks", async () => {
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

    expect(
      await testDb.select().from(activity).where(eq(activity.spaceId, space.id)),
    ).toEqual([]);
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

  it("treats moving a Task to its current Section as a no-op", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Stay put",
    });

    const result = await moveTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      targetSectionId: sections.daily.id,
    });

    expect(result).toEqual(created);
    expect(result.sectionId).toBe(sections.daily.id);
    expect(result.updatedAt).toEqual(created.updatedAt);
    await expect(
      getTask(testDb, { userId: editor.id, spaceId: space.id, taskId: created.id }),
    ).resolves.toEqual(created);
    expect((await activityFor(created.id)).map((row) => row.action)).toEqual([
      "created",
    ]);
  });

  it("rejects moves to another Space's Section or of another Space's Task", async () => {
    const { space, sections, editor, customTasks } = await seedSpace();
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
    const homeTask = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Home Task",
    });
    const otherTask = await createTask(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      sectionId: other.sections.daily.id,
      title: "Other Space Task",
    });

    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: homeTask.id,
        targetSectionId: other.sections.daily.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: otherTask.id,
        targetSectionId: customTasks.id,
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(
      getTask(testDb, {
        userId: editor.id,
        spaceId: other.space.id,
        taskId: otherTask.id,
      }),
    ).resolves.toMatchObject({ sectionId: other.sections.daily.id });

    const homeRows = await activityFor(homeTask.id);
    expect(homeRows).toHaveLength(1);
    expect(homeRows[0]).toMatchObject({ action: "created", spaceId: space.id });
    const otherRows = await activityFor(otherTask.id);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0]).toMatchObject({
      action: "created",
      spaceId: other.space.id,
    });
  });

  it("denies Task mutations to read-only Members and cross-Space assignees", async () => {
    const { space, sections, editor, readOnly, outsider, customTasks } =
      await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Protected",
    });
    await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
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
        reopenTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
        }),
      () =>
        moveTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
          targetSectionId: customTasks.id,
        }),
      // Same-section no-op still requires editor; do not skip membership.
      () =>
        moveTask(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          taskId: created.id,
          targetSectionId: sections.daily.id,
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

    const rows = await testDb
      .select()
      .from(activity)
      .where(eq(activity.spaceId, space.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.action).sort()).toEqual(["completed", "created"]);
    expect(rows.every((row) => row.actorUserId === editor.id)).toBe(true);
    expect(rows.every((row) => row.entityId === created.id)).toBe(true);
  });

  it("rejects non-member reads and cross-Space Task lookups", async () => {
    const { space, sections, editor, outsider } = await seedSpace();
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
    const otherTask = await createTask(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      sectionId: other.sections.daily.id,
      title: "Other Space Task",
    });
    const homeTask = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Home Task",
    });

    await expect(
      listTasks(testDb, { userId: outsider.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      getTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: otherTask.id,
      }),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    await expect(
      getTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: homeTask.id,
      }),
    ).resolves.toMatchObject({ id: homeTask.id });
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

  it("filters by dueOn and status without changing the default result", async () => {
    const { space, sections, editor, customTasks } = await seedSpace();

    const datedOpen = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Dated open",
      dueOn: "2026-08-12",
    });
    const undatedOpen = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Undated open",
    });
    const datedCompleted = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: customTasks.id,
      title: "Dated completed",
      dueOn: "2026-08-13",
    });
    const undatedCompleted = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: customTasks.id,
      title: "Undated completed",
    });
    await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: datedCompleted.id,
    });
    await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: undatedCompleted.id,
    });

    // Defaults return everything, which keeps /api/v1 behaviour unchanged.
    await expect(
      listTasks(testDb, { userId: editor.id, spaceId: space.id }),
    ).resolves.toHaveLength(4);

    await expect(
      listTasks(testDb, { userId: editor.id, spaceId: space.id, dueOn: "dated" }),
    ).resolves.toMatchObject([
      { id: datedOpen.id },
      { id: datedCompleted.id },
    ]);
    await expect(
      listTasks(testDb, { userId: editor.id, spaceId: space.id, dueOn: "undated" }),
    ).resolves.toMatchObject([
      { id: undatedOpen.id },
      { id: undatedCompleted.id },
    ]);
    await expect(
      listTasks(testDb, { userId: editor.id, spaceId: space.id, status: "open" }),
    ).resolves.toMatchObject([{ id: datedOpen.id }, { id: undatedOpen.id }]);
    await expect(
      listTasks(testDb, {
        userId: editor.id,
        spaceId: space.id,
        status: "completed",
      }),
    ).resolves.toMatchObject([
      { id: datedCompleted.id },
      { id: undatedCompleted.id },
    ]);

    // Upcoming's combination: exactly one row survives both filters.
    await expect(
      listTasks(testDb, {
        userId: editor.id,
        spaceId: space.id,
        dueOn: "dated",
        status: "open",
      }),
    ).resolves.toMatchObject([{ id: datedOpen.id }]);
  });

  it("records created Activity and nothing when create is denied", async () => {
    const { space, sections, editor, readOnly, outsider } = await seedSpace();

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "  Paint the door  ",
    });

    const rows = await activityFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "task",
      entityId: created.id,
      action: "created",
      period: null,
      details: { title: "Paint the door" },
    });

    await expect(
      createTask(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
        title: "Nope",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      createTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
        title: "Assigned to a stranger",
        assigneeId: outsider.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });

    const spaceRows = await testDb
      .select()
      .from(activity)
      .where(eq(activity.spaceId, space.id));
    expect(spaceRows).toEqual(rows);
  });

  it("records assigned or updated from the fields that actually changed", async () => {
    const { space, sections, editor, assignee } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Chore",
    });

    const assigned = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      assigneeId: assignee.id,
    });
    expect(assigned.assigneeId).toBe(assignee.id);

    let rows = await activityFor(created.id);
    expect(rows.filter((row) => row.action === "assigned")).toHaveLength(1);
    expect(rows.find((row) => row.action === "assigned")).toMatchObject({
      actorUserId: editor.id,
      entityType: "task",
      entityId: created.id,
    });
    expect(rows.find((row) => row.action === "assigned")?.details).toEqual({
      title: "Chore",
      changes: {
        assigneeId: { from: null, to: assignee.id, toName: "Assignee" },
      },
    });

    const cleared = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      assigneeId: null,
    });
    expect(cleared.assigneeId).toBeNull();
    rows = await activityFor(created.id);
    const clearedRow = rows.find((row) => {
      const details = row.details as {
        changes?: { assigneeId?: { to: string | null } };
      };
      return row.action === "assigned" && details.changes?.assigneeId?.to === null;
    });
    expect(clearedRow?.details).toEqual({
      title: "Chore",
      changes: {
        assigneeId: { from: assignee.id, to: null, fromName: "Assignee" },
      },
    });
    expect(rows.filter((row) => row.action === "assigned")).toHaveLength(2);

    const beforeTitle = rows;
    const retitled = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "  Fold laundry  ",
    });
    expect(retitled.title).toBe("Fold laundry");
    const titleRows = addedActivity(beforeTitle, await activityFor(created.id));
    expect(titleRows).toHaveLength(1);
    expect(titleRows[0]).toMatchObject({
      action: "updated",
      actorUserId: editor.id,
    });
    expect(titleRows[0]?.details).toEqual({
      title: "Fold laundry",
      changes: { title: { from: "Chore", to: "Fold laundry" } },
    });

    const beforeDue = await activityFor(created.id);
    await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      dueOn: "2026-08-12",
    });
    const dueRows = addedActivity(beforeDue, await activityFor(created.id));
    expect(dueRows).toHaveLength(1);
    expect(dueRows[0]).toMatchObject({ action: "updated", actorUserId: editor.id });
    expect(dueRows[0]?.details).toEqual({
      title: "Fold laundry",
      changes: { dueOn: { from: null, to: "2026-08-12" } },
    });

    const beforeBoth = await activityFor(created.id);
    await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "Fold towels",
      assigneeId: assignee.id,
    });
    const bothRows = addedActivity(beforeBoth, await activityFor(created.id));
    expect(bothRows).toHaveLength(1);
    expect(bothRows[0]).toMatchObject({
      action: "updated",
      actorUserId: editor.id,
    });
    expect(bothRows[0]?.details).toEqual({
      title: "Fold towels",
      changes: {
        title: { from: "Fold laundry", to: "Fold towels" },
        assigneeId: {
          from: null,
          to: assignee.id,
          toName: "Assignee",
        },
      },
    });
    expect(bothRows.filter((row) => row.action === "assigned")).toEqual([]);

    const beforeSame = await activityFor(created.id);
    const same = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "Fold towels",
    });
    const padded = await updateTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      title: "  Fold towels  ",
    });
    expect(same.title).toBe("Fold towels");
    expect(padded.title).toBe("Fold towels");
    expect(await activityFor(created.id)).toEqual(beforeSame);
  });

  it("records toggle as completed or reopened from the returned completedAt", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Toggle me",
    });

    const beforeComplete = await activityFor(created.id);
    const completed = await toggleTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    const completedRows = addedActivity(beforeComplete, await activityFor(created.id));
    expect(completed.completedAt).not.toBeNull();
    expect(completedRows).toHaveLength(1);
    expect(completedRows[0]).toMatchObject({
      action: "completed",
      actorUserId: editor.id,
      details: { title: "Toggle me" },
    });

    const beforeReopen = await activityFor(created.id);
    const reopened = await toggleTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    const reopenedRows = addedActivity(beforeReopen, await activityFor(created.id));
    expect(reopened.completedAt).toBeNull();
    expect(reopenedRows).toHaveLength(1);
    expect(reopenedRows[0]).toMatchObject({
      action: "reopened",
      actorUserId: editor.id,
      details: { title: "Toggle me" },
    });
  });

  it("records completed again when a Task is already complete, and records reopened", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Stay completed",
    });

    await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    const again = await completeTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(again.completedAt).not.toBeNull();
    expect(again.completedBy).toBe(editor.id);

    const completedRows = (await activityFor(created.id)).filter(
      (row) => row.action === "completed",
    );
    expect(completedRows).toHaveLength(2);
    expect(completedRows.every((row) => row.actorUserId === editor.id)).toBe(true);
    for (const row of completedRows) {
      expect(row.details).toEqual({ title: "Stay completed" });
    }

    const reopened = await reopenTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(reopened.completedAt).toBeNull();
    const reopenedRows = (await activityFor(created.id)).filter(
      (row) => row.action === "reopened",
    );
    expect(reopenedRows).toHaveLength(1);
    expect(reopenedRows[0]).toMatchObject({
      actorUserId: editor.id,
      entityType: "task",
      entityId: created.id,
      details: { title: "Stay completed" },
    });
  });

  it("records a move with Section ids and names, and skips a same-Section move", async () => {
    const { space, sections, editor, customTasks, notes } = await seedSpace();
    await testDb
      .update(section)
      .set({ name: "Today" })
      .where(eq(section.id, sections.daily.id));
    await testDb
      .update(section)
      .set({ name: "Shopping" })
      .where(eq(section.id, customTasks.id));

    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Move me",
    });

    await expect(
      moveTask(testDb, {
        userId: editor.id,
        spaceId: space.id,
        taskId: created.id,
        targetSectionId: notes.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    expect((await activityFor(created.id)).map((row) => row.action)).toEqual([
      "created",
    ]);

    const moved = await moveTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      targetSectionId: customTasks.id,
    });
    expect(moved).toMatchObject({
      sectionId: customTasks.id,
      sectionKind: "tasks",
    });

    const moveRows = (await activityFor(created.id)).filter(
      (row) => row.action === "moved",
    );
    expect(moveRows).toHaveLength(1);
    expect(moveRows[0]).toMatchObject({
      actorUserId: editor.id,
      entityType: "task",
      entityId: created.id,
      spaceId: space.id,
    });
    expect(moveRows[0]?.details).toEqual({
      title: "Move me",
      fromSectionId: sections.daily.id,
      toSectionId: customTasks.id,
      fromSectionName: "Today",
      toSectionName: "Shopping",
    });

    const beforeSame = await activityFor(created.id);
    const same = await moveTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
      targetSectionId: customTasks.id,
    });
    expect(same.sectionId).toBe(customTasks.id);
    expect(await activityFor(created.id)).toEqual(beforeSame);
  });

  it("keeps deleted Activity after the Task row is gone", async () => {
    const { space, sections, editor } = await seedSpace();
    const created = await createTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Throw away",
    });

    const deleted = await deleteTask(testDb, {
      userId: editor.id,
      spaceId: space.id,
      taskId: created.id,
    });
    expect(deleted.id).toBe(created.id);
    expect(
      await testDb.select().from(task).where(eq(task.id, created.id)),
    ).toEqual([]);

    const rows = await activityFor(created.id);
    expect(rows.map((row) => row.action).sort()).toEqual(["created", "deleted"]);
    expect(rows.find((row) => row.action === "deleted")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "task",
      entityId: created.id,
      action: "deleted",
      details: { title: "Throw away" },
    });
  });
});
