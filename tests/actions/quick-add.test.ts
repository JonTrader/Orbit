import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { quickAdd } from "@/lib/actions/quick-add";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { monthly, note, section, spaceMember, task } from "@/lib/db/schema";

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
  customTasksId: string;
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

  const [customTasks] = await testDb
    .insert(section)
    .values({
      spaceId: seeded.space.id,
      name: "Errands",
      kind: "tasks",
      sortOrder: 2,
    })
    .returning();

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
    dailyId: seeded.sections.daily.id,
    monthliesId: seeded.sections.monthlies.id,
    customTasksId: customTasks.id,
  };
}

async function seedMixedSection(
  spaceId: string,
): Promise<string> {
  const [mixed] = await testDb
    .insert(section)
    .values({
      spaceId,
      name: "Catch-all",
      kind: "mixed",
      sortOrder: 4,
    })
    .returning();
  return mixed.id;
}

describe("quickAdd action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("creates a Task in the Daily Section of the Active Space", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.dailyId,
      title: "  Water plants  ",
    });

    assertCreatedTask(result, s.dailyId, "Water plants");
    const rows = await testDb.select().from(task);
    expect(rows).toHaveLength(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(spaceLayoutPath(s.spaceId), "layout");
  });

  it("creates a Task in a custom tasks Section", async () => {
    const s = await seedSpace();
    authenticateAs(s.editorId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.customTasksId,
      title: "Buy stamps",
    });

    assertCreatedTask(result, s.customTasksId, "Buy stamps");
  });

  it("creates a Note with an empty body in a notes Section", async () => {
    const s = await seedSpace();
    const [notesSection] = await testDb
      .insert(section)
      .values({
        spaceId: s.spaceId,
        name: "Ideas",
        kind: "notes",
        sortOrder: 3,
      })
      .returning();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: notesSection.id,
      title: "Trip ideas",
    });

    if (!result.ok || result.data.entity !== "note") {
      throw new Error("Expected a created note");
    }
    expect(result.data.note.title).toBe("Trip ideas");
    expect(result.data.note.body).toBe("");
    const rows = await testDb.select().from(note);
    expect(rows).toHaveLength(1);
  });

  it("creates a Note with a body when one is given", async () => {
    const s = await seedSpace();
    const [notesSection] = await testDb
      .insert(section)
      .values({
        spaceId: s.spaceId,
        name: "Ideas",
        kind: "notes",
        sortOrder: 3,
      })
      .returning();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: notesSection.id,
      title: "Trip ideas",
      body: "Kyoto in the fall",
    });

    if (!result.ok || result.data.entity !== "note") {
      throw new Error("Expected a created note");
    }
    expect(result.data.note.title).toBe("Trip ideas");
    expect(result.data.note.body).toBe("Kyoto in the fall");
  });

  it("creates a Task by default in a mixed Section", async () => {
    const s = await seedSpace();
    const mixedId = await seedMixedSection(s.spaceId);
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: mixedId,
      title: "Fix the shelf",
    });

    assertCreatedTask(result, mixedId, "Fix the shelf");
    expect(await testDb.select().from(note)).toHaveLength(0);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("creates a Note with body in a mixed Section when asNote is true", async () => {
    const s = await seedSpace();
    const mixedId = await seedMixedSection(s.spaceId);
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: mixedId,
      title: "Packing list",
      body: "Charger, passport",
      asNote: true,
    });

    if (!result.ok || result.data.entity !== "note") {
      throw new Error("Expected a created note");
    }
    expect(result.data.note.title).toBe("Packing list");
    expect(result.data.note.body).toBe("Charger, passport");
    expect(result.data.note.sectionKind).toBe("mixed");
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("ignores asNote for tasks and notes Sections", async () => {
    const s = await seedSpace();
    const [notesSection] = await testDb
      .insert(section)
      .values({
        spaceId: s.spaceId,
        name: "Ideas",
        kind: "notes",
        sortOrder: 3,
      })
      .returning();
    authenticateAs(s.ownerId);

    const taskResult = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.customTasksId,
      title: "Still a task",
      asNote: true,
    });
    assertCreatedTask(taskResult, s.customTasksId, "Still a task");

    const noteResult = await quickAdd({
      spaceId: s.spaceId,
      sectionId: notesSection.id,
      title: "Still a note",
      asNote: true,
    });
    if (!noteResult.ok || noteResult.data.entity !== "note") {
      throw new Error("Expected a created note");
    }
    expect(noteResult.data.note.sectionKind).toBe("notes");
  });

  it("creates a Monthly in the Monthlies Section when a due day is given", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.monthliesId,
      title: "Pay rent",
      dueDayOfMonth: 15,
    });

    if (!result.ok || result.data.entity !== "monthly") {
      throw new Error("Expected a created monthly");
    }
    expect(result.data.monthly.title).toBe("Pay rent");
    expect(result.data.monthly.dueDayOfMonth).toBe(15);
    // The next due date lands on the requested day of a real month.
    expect(result.data.monthly.nextDueOn).toMatch(/-15$/);
    const rows = await testDb.select().from(monthly);
    expect(rows).toHaveLength(1);
  });

  it("rejects a Monthly quick-add without a due day and creates nothing", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.monthliesId,
      title: "Pay rent",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_DUE_DAY");
    }
    expect(await testDb.select().from(monthly)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects Upcoming as a quick-add target", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    // Upcoming renders no Section row, so both its placeholder id and any
    // unknown id must reject without creating content.
    const sentinelResult = await quickAdd({
      spaceId: s.spaceId,
      sectionId: "upcoming",
      title: "Mystery item",
    });
    const unknownResult = await quickAdd({
      spaceId: s.spaceId,
      sectionId: randomUUID(),
      title: "Mystery item",
    });

    expect(sentinelResult.ok).toBe(false);
    if (!sentinelResult.ok) {
      expect(sentinelResult.error.code).toBe("VALIDATION_ERROR");
    }
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) {
      expect(unknownResult.error.code).toBe("SECTION_NOT_FOUND");
    }
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(await testDb.select().from(note)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an empty title as a validation error", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.dailyId,
      title: "   ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["title"]);
    }
    expect(await testDb.select().from(task)).toHaveLength(0);
  });

  it("blocks read-only Members from mutating via quick-add", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.dailyId,
      title: "Read-only attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedSpace();
    authenticateAs(s.outsiderId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: s.dailyId,
      title: "Outsider attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a Section that does not belong to the given Space", async () => {
    const s = await seedSpace();
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: s.ownerId,
    });
    authenticateAs(s.ownerId);

    const result = await quickAdd({
      spaceId: s.spaceId,
      sectionId: other.sections.daily.id,
      title: "Cross-space Section",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SECTION_NOT_FOUND");
    }
    expect(await testDb.select().from(task)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});

function assertCreatedTask(
  result: Awaited<ReturnType<typeof quickAdd>>,
  expectedSectionId: string,
  expectedTitle: string,
): void {
  if (!result.ok || result.data.entity !== "task") {
    throw new Error("Expected a created task");
  }
  expect(result.data.task.sectionId).toBe(expectedSectionId);
  expect(result.data.task.title).toBe(expectedTitle);
  expect(result.data.task.completedAt).toBeNull();
}
