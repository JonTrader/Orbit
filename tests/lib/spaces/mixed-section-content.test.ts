import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, task } from "@/lib/db/schema";
import { createNote } from "@/lib/services/notes";
import { createTask } from "@/lib/services/tasks";
import { fetchMixedSectionContent } from "@/lib/spaces/queries/fetch-mixed-section-content";

import { migrateTestDb, testDb, truncateAll } from "../../setup/db";
import { createUser } from "../../setup/fixtures";

describe("fetchMixedSectionContent", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });
    const [mixed] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Kitchen",
        kind: "mixed",
        sortOrder: 2,
      })
      .returning();
    const [other] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Errands",
        kind: "tasks",
        sortOrder: 3,
      })
      .returning();

    return { owner, ...seeded, mixed, other };
  }

  it("returns Tasks and Notes for the Section in one round trip", async () => {
    const { space, owner, mixed, other } = await seedSpace();

    const openTask = await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: mixed.id,
      title: "Wipe counters",
      dueOn: "2026-09-10",
    });
    const doneTask = await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: mixed.id,
      title: "Done chore",
    });
    await testDb
      .update(task)
      .set({ completedAt: new Date(), completedBy: owner.id })
      .where(eq(task.id, doneTask.id));

    const firstNote = await createNote(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: mixed.id,
      title: "Paint",
      body: "Warm white",
    });
    const secondNote = await createNote(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: mixed.id,
      title: "Measurements",
    });

    // Outside the mixed Section - must not appear.
    await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: other.id,
      title: "Other task",
    });

    const selectSpy = vi.spyOn(testDb, "select");
    const content = await fetchMixedSectionContent(testDb, {
      spaceId: space.id,
      sectionId: mixed.id,
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    selectSpy.mockRestore();

    expect(content.tasks.map((row) => row.title)).toEqual([
      "Wipe counters",
      "Done chore",
    ]);
    expect(content.tasks.map((row) => row.id)).toEqual([
      openTask.id,
      doneTask.id,
    ]);
    expect(content.tasks[0]?.dueOn).toBe("2026-09-10");
    expect(content.tasks[0]?.completedAt).toBeNull();
    expect(content.tasks[1]?.completedAt).toBeInstanceOf(Date);

    expect(content.notes.map((row) => ({ title: row.title, body: row.body }))).toEqual([
      { title: "Paint", body: "Warm white" },
      { title: "Measurements", body: "" },
    ]);
    expect(content.notes.map((row) => row.id)).toEqual([
      firstNote.id,
      secondNote.id,
    ]);
    expect(content.notes[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("returns empty arrays when the Section has no content", async () => {
    const { space, mixed } = await seedSpace();

    await expect(
      fetchMixedSectionContent(testDb, {
        spaceId: space.id,
        sectionId: mixed.id,
      }),
    ).resolves.toEqual({ tasks: [], notes: [] });
  });
});
