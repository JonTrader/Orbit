import "../setup/api-mocks";
import "../setup/action-mocks";

import { SPACE_LAYOUT_PATTERN } from "@/lib/space-paths";
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { toggleComplete } from "@/lib/actions/toggle-complete";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { monthly, spaceMember, task } from "@/lib/db/schema";

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

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
    dailyId: seeded.sections.daily.id,
    monthliesId: seeded.sections.monthlies.id,
  };
}

async function seedTask(
  s: SeededSpace,
  overrides: Partial<typeof task.$inferInsert> = {},
): Promise<typeof task.$inferSelect> {
  const [row] = await testDb
    .insert(task)
    .values({
      spaceId: s.spaceId,
      sectionId: s.dailyId,
      sectionKind: "daily",
      title: "Sweep the porch",
      createdBy: s.ownerId,
      ...overrides,
    })
    .returning();
  return row;
}

async function seedMonthly(
  s: SeededSpace,
  overrides: Partial<typeof monthly.$inferInsert> = {},
): Promise<typeof monthly.$inferSelect> {
  const [row] = await testDb
    .insert(monthly)
    .values({
      spaceId: s.spaceId,
      sectionId: s.monthliesId,
      sectionKind: "monthlies",
      title: "Pay rent",
      dueDayOfMonth: 15,
      nextDueOn: "2030-06-15",
      createdBy: s.ownerId,
      ...overrides,
    })
    .returning();
  return row;
}

describe("toggleComplete action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("completes an open Task and records who completed it", async () => {
    const s = await seedSpace();
    const seeded = await seedTask(s);
    authenticateAs(s.editorId);

    const result = await toggleComplete({
      spaceId: s.spaceId,
      entity: "task",
      entityId: seeded.id,
    });

    if (!result.ok || result.data.entity !== "task") {
      throw new Error("Expected an updated task");
    }
    expect(result.data.task.completedAt).not.toBeNull();
    expect(result.data.task.completedBy).toBe(s.editorId);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACE_LAYOUT_PATTERN, "layout");
  });

  it("reopens a completed Task when toggled again", async () => {
    const s = await seedSpace();
    const seeded = await seedTask(s, {
      completedAt: new Date(),
      completedBy: s.ownerId,
    });
    authenticateAs(s.ownerId);

    const result = await toggleComplete({
      spaceId: s.spaceId,
      entity: "task",
      entityId: seeded.id,
    });

    if (!result.ok || result.data.entity !== "task") {
      throw new Error("Expected an updated task");
    }
    expect(result.data.task.completedAt).toBeNull();
    expect(result.data.task.completedBy).toBeNull();
  });

  it("completing a Monthly advances nextDueOn by one period", async () => {
    const s = await seedSpace();
    const seeded = await seedMonthly(s);
    authenticateAs(s.ownerId);

    const result = await toggleComplete({
      spaceId: s.spaceId,
      entity: "monthly",
      entityId: seeded.id,
    });

    if (!result.ok || result.data.entity !== "monthly") {
      throw new Error("Expected an updated monthly");
    }
    expect(result.data.monthly.nextDueOn).toBe("2030-07-15");
    expect(result.data.monthly.lastCompletedAt).not.toBeNull();
    expect(result.data.monthly.lastCompletedBy).toBe(s.ownerId);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("blocks read-only Members for Tasks and Monthlies", async () => {
    const s = await seedSpace();
    const seededTask = await seedTask(s);
    const seededMonthly = await seedMonthly(s);
    authenticateAs(s.readOnlyId);

    const taskResult = await toggleComplete({
      spaceId: s.spaceId,
      entity: "task",
      entityId: seededTask.id,
    });
    const monthlyResult = await toggleComplete({
      spaceId: s.spaceId,
      entity: "monthly",
      entityId: seededMonthly.id,
    });

    expect(taskResult.ok).toBe(false);
    if (!taskResult.ok) {
      expect(taskResult.error.code).toBe("INSUFFICIENT_ROLE");
    }
    expect(monthlyResult.ok).toBe(false);
    if (!monthlyResult.ok) {
      expect(monthlyResult.error.code).toBe("INSUFFICIENT_ROLE");
    }

    const [taskRow] = await testDb.select().from(task);
    expect(taskRow.completedAt).toBeNull();
    const [monthlyRow] = await testDb.select().from(monthly);
    expect(monthlyRow.nextDueOn).toBe("2030-06-15");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedSpace();
    const seeded = await seedTask(s);
    authenticateAs(s.outsiderId);

    const result = await toggleComplete({
      spaceId: s.spaceId,
      entity: "task",
      entityId: seeded.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("reports a missing Task or Monthly without revalidating", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const taskResult = await toggleComplete({
      spaceId: s.spaceId,
      entity: "task",
      entityId: randomUUID(),
    });
    const monthlyResult = await toggleComplete({
      spaceId: s.spaceId,
      entity: "monthly",
      entityId: randomUUID(),
    });

    expect(taskResult.ok).toBe(false);
    if (!taskResult.ok) {
      expect(taskResult.error.code).toBe("TASK_NOT_FOUND");
    }
    expect(monthlyResult.ok).toBe(false);
    if (!monthlyResult.ok) {
      expect(monthlyResult.error.code).toBe("MONTHLY_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects invalid input as a validation error", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const badEntity = await toggleComplete({
      spaceId: s.spaceId,
      entity: "note",
      entityId: randomUUID(),
    });
    const missingEntity = await toggleComplete({
      spaceId: s.spaceId,
      entityId: randomUUID(),
    });

    for (const result of [badEntity, missingEntity]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
