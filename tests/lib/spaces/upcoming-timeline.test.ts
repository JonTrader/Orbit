import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { monthly, section, task } from "@/lib/db/schema";
import { createMonthly } from "@/lib/services/monthlies";
import { createTask } from "@/lib/services/tasks";
import { fetchUpcomingTimeline } from "@/lib/spaces/queries/fetch-upcoming-timeline";

import { testDb, truncateAll } from "../../setup/db";
import { createUser } from "../../setup/fixtures";

describe("fetchUpcomingTimeline", () => {
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });
    const [errands] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Errands",
        kind: "tasks",
        sortOrder: 2,
      })
      .returning();

    return { owner, ...seeded, errands };
  }

  it("returns Monthlies and dated open Tasks in date order; names from layout sections", async () => {
    const { space, sections, owner, errands } = await seedSpace();

    const rent = await createMonthly(testDb, {
      userId: owner.id,
      spaceId: space.id,
      title: "Rent",
      dueDayOfMonth: 1,
    });
    await testDb
      .update(monthly)
      .set({ nextDueOn: "2026-10-01" })
      .where(eq(monthly.id, rent.id));

    const recycle = await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Recycling",
      dueOn: "2026-09-10",
    });
    const groceries = await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: errands.id,
      title: "Groceries",
      dueOn: "2026-09-05",
    });
    await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Undated Task",
      dueOn: null,
    });
    const done = await createTask(testDb, {
      userId: owner.id,
      spaceId: space.id,
      sectionId: sections.daily.id,
      title: "Finished",
      dueOn: "2026-09-01",
    });
    await testDb
      .update(task)
      .set({ completedAt: new Date(), completedBy: owner.id })
      .where(eq(task.id, done.id));

    const timeline = await fetchUpcomingTimeline(testDb, space.id);

    expect(timeline.map((row) => ({ kind: row.kind, title: row.title, date: row.date }))).toEqual([
      { kind: "task", title: "Groceries", date: "2026-09-05" },
      { kind: "task", title: "Recycling", date: "2026-09-10" },
      { kind: "monthly", title: "Rent", date: "2026-10-01" },
    ]);
    expect(timeline.map((row) => row.id)).toEqual([
      groceries.id,
      recycle.id,
      rent.id,
    ]);

    // Section names come from layout sections in memory (same list getActiveSpace returns).
    const layoutSections = [sections.daily, sections.monthlies, errands];
    const sectionNames = new Map(layoutSections.map((s) => [s.id, s.name]));
    const labeled = timeline.map((row) => ({
      title: row.title,
      kind: row.kind,
      sectionName:
        row.kind === "task" ? (sectionNames.get(row.sectionId) ?? null) : null,
    }));
    expect(labeled).toEqual([
      { title: "Groceries", kind: "task", sectionName: "Errands" },
      { title: "Recycling", kind: "task", sectionName: sections.daily.name },
      { title: "Rent", kind: "monthly", sectionName: null },
    ]);
  });
});
