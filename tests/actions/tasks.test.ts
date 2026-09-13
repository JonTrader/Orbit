import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { deleteTask, updateTask } from "@/lib/actions/tasks";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember, task } from "@/lib/db/schema";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededTask {
  ownerId: string;
  editorId: string;
  readOnlyId: string;
  outsiderId: string;
  spaceId: string;
  taskId: string;
}

async function seedTask(
  overrides: Partial<typeof task.$inferInsert> = {},
): Promise<SeededTask> {
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

  const [created] = await testDb
    .insert(task)
    .values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.daily.id,
      sectionKind: "daily",
      title: "Original title",
      dueOn: "2026-08-12",
      createdBy: owner.id,
      ...overrides,
    })
    .returning();

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
    taskId: created.id,
  };
}

async function seedTaskInOtherSpace(ownerId: string) {
  const other = await createSpaceWithSystemSections(testDb, {
    name: "Other",
    ownerUserId: ownerId,
  });
  const [created] = await testDb
    .insert(task)
    .values({
      spaceId: other.space.id,
      sectionId: other.sections.daily.id,
      sectionKind: "daily",
      title: "Other Space Task",
      createdBy: ownerId,
    })
    .returning();
  return created;
}

describe("updateTask action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("updates a Task's title and due date and revalidates the Space layout", async () => {
    const s = await seedTask();
    authenticateAs(s.editorId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      title: "  Renamed  ",
      dueOn: "2026-09-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Renamed");
    expect(result.data.dueOn).toBe("2026-09-01");

    const [row] = await testDb.select().from(task);
    expect(row.title).toBe("Renamed");
    expect(row.dueOn).toBe("2026-09-01");
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("clears the due date with null, leaving the title untouched", async () => {
    const s = await seedTask();
    authenticateAs(s.editorId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      dueOn: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Original title");
    expect(result.data.dueOn).toBeNull();
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("rejects a whitespace-only title as a validation error", async () => {
    const s = await seedTask();
    authenticateAs(s.ownerId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      title: "   ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["title"]);
    }
    const [row] = await testDb.select().from(task);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an invalid due date as a validation error", async () => {
    const s = await seedTask();
    authenticateAs(s.ownerId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      dueOn: "2026-02-30",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["dueOn"]);
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an update with neither title nor due date", async () => {
    const s = await seedTask();
    authenticateAs(s.ownerId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects unknown task ids with TASK_NOT_FOUND", async () => {
    const s = await seedTask();
    authenticateAs(s.ownerId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: crypto.randomUUID(),
      title: "Ghost",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TASK_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks read-only Members from editing Tasks", async () => {
    const s = await seedTask();
    authenticateAs(s.readOnlyId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      title: "Read-only attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    const [row] = await testDb.select().from(task);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedTask();
    authenticateAs(s.outsiderId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
      title: "Outsider attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a Task that does not belong to the given Space", async () => {
    const s = await seedTask();
    const otherTask = await seedTaskInOtherSpace(s.ownerId);
    authenticateAs(s.ownerId);

    const result = await updateTask({
      spaceId: s.spaceId,
      taskId: otherTask.id,
      title: "Stolen",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TASK_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});

describe("deleteTask action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("deletes a Task and revalidates the Space layout", async () => {
    const s = await seedTask();
    authenticateAs(s.editorId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the delete to succeed");
    expect(result.data.id).toBe(s.taskId);
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("deletes a completed Task", async () => {
    const s = await seedTask({
      completedAt: new Date(),
    });
    authenticateAs(s.editorId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
    });

    expect(result.ok).toBe(true);
    expect(await testDb.select().from(task)).toHaveLength(0);
  });

  it("rejects unknown task ids with TASK_NOT_FOUND", async () => {
    const s = await seedTask();
    authenticateAs(s.ownerId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: crypto.randomUUID(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TASK_NOT_FOUND");
    }
    expect(await testDb.select().from(task)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks read-only Members from deleting Tasks", async () => {
    const s = await seedTask();
    authenticateAs(s.readOnlyId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    expect(await testDb.select().from(task)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedTask();
    authenticateAs(s.outsiderId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: s.taskId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(await testDb.select().from(task)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a Task that does not belong to the given Space", async () => {
    const s = await seedTask();
    const otherTask = await seedTaskInOtherSpace(s.ownerId);
    authenticateAs(s.ownerId);

    const result = await deleteTask({
      spaceId: s.spaceId,
      taskId: otherTask.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TASK_NOT_FOUND");
    }
    expect(await testDb.select().from(task)).toHaveLength(2);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
