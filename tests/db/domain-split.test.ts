import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { monthly, note, section, task } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

/**
 * ADR 0001: Daily and Monthlies are separate domains. The database, not just
 * the services, has to refuse a Task in Monthlies and a Monthly anywhere else.
 */
describe("Task vs Monthly separation", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser();
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });
    return { owner, ...seeded };
  }

  async function addCustomSection(
    spaceId: string,
    name: string,
    kind: "tasks" | "notes" | "mixed",
  ) {
    const [row] = await testDb
      .insert(section)
      .values({ spaceId, name, kind, isSystem: false, sortOrder: 2 })
      .returning();
    return row;
  }

  it("accepts a Task in Daily", async () => {
    const { space, sections } = await seedSpace();
    const [row] = await testDb
      .insert(task)
      .values({
        spaceId: space.id,
        sectionId: sections.daily.id,
        sectionKind: "daily",
        title: "Take out recycling",
      })
      .returning();
    expect(row.completedAt).toBeNull();
  });

  it("accepts a Task in custom tasks and mixed Sections", async () => {
    const { space } = await seedSpace();
    for (const kind of ["tasks", "mixed"] as const) {
      const custom = await addCustomSection(space.id, `Custom ${kind}`, kind);
      const [row] = await testDb
        .insert(task)
        .values({
          spaceId: space.id,
          sectionId: custom.id,
          sectionKind: kind,
          title: `Task in ${kind}`,
        })
        .returning();
      expect(row.sectionKind).toBe(kind);
    }
  });

  it("rejects a Task in the Monthlies Section", async () => {
    const { space, sections } = await seedSpace();

    // Honest attempt: claim the Monthlies kind.
    await expect(
      testDb.insert(task).values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
      }),
    ).rejects.toThrow();

    // Sneaky attempt: point at Monthlies while claiming a legal kind.
    await expect(
      testDb.insert(task).values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "daily",
        title: "Rent",
      }),
    ).rejects.toThrow();
  });

  it("rejects a Task in a notes Section", async () => {
    const { space } = await seedSpace();
    const notes = await addCustomSection(space.id, "Ideas", "notes");
    await expect(
      testDb.insert(task).values({
        spaceId: space.id,
        sectionId: notes.id,
        sectionKind: "notes",
        title: "Not a note",
      }),
    ).rejects.toThrow();
  });

  it("accepts a Monthly in the Monthlies Section", async () => {
    const { space, sections } = await seedSpace();
    const [row] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
        dueDayOfMonth: 1,
        nextDueOn: "2026-09-01",
      })
      .returning();
    expect(row.nextDueOn).toBe("2026-09-01");
  });

  it("rejects a Monthly outside the Monthlies Section", async () => {
    const { space, sections } = await seedSpace();
    const custom = await addCustomSection(space.id, "Errands", "tasks");

    for (const target of [
      { sectionId: sections.daily.id, sectionKind: "daily" as const },
      { sectionId: custom.id, sectionKind: "tasks" as const },
      // Sneaky: legal kind value pointing at a Daily section.
      { sectionId: sections.daily.id, sectionKind: "monthlies" as const },
    ]) {
      await expect(
        testDb.insert(monthly).values({
          spaceId: space.id,
          ...target,
          title: "Rent",
          dueDayOfMonth: 1,
          nextDueOn: "2026-09-01",
        }),
      ).rejects.toThrow();
    }
  });

  it("rejects a Task or Monthly move that would reclassify it", async () => {
    const { space, sections } = await seedSpace();
    const [row] = await testDb
      .insert(task)
      .values({
        spaceId: space.id,
        sectionId: sections.daily.id,
        sectionKind: "daily",
        title: "Take out recycling",
      })
      .returning();

    await expect(
      testDb
        .update(task)
        .set({ sectionId: sections.monthlies.id, sectionKind: "monthlies" })
        .where(eq(task.id, row.id)),
    ).rejects.toThrow();

    const [monthlyRow] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
        dueDayOfMonth: 1,
        nextDueOn: "2026-09-01",
      })
      .returning();

    await expect(
      testDb
        .update(monthly)
        .set({ sectionId: sections.daily.id, sectionKind: "daily" })
        .where(eq(monthly.id, monthlyRow.id)),
    ).rejects.toThrow();
  });

  it("rejects rows that point at a Section in another Space", async () => {
    const home = await seedSpace();
    const other = await seedSpace();

    await expect(
      testDb.insert(task).values({
        spaceId: home.space.id,
        sectionId: other.sections.daily.id,
        sectionKind: "daily",
        title: "Cross-space leak",
      }),
    ).rejects.toThrow();
  });

  it("keeps Notes out of task-only Sections", async () => {
    const { space, sections } = await seedSpace();
    const mixed = await addCustomSection(space.id, "Kitchen", "mixed");

    const [row] = await testDb
      .insert(note)
      .values({
        spaceId: space.id,
        sectionId: mixed.id,
        sectionKind: "mixed",
        title: "Paint colours",
        body: "Warm white for the hallway.",
      })
      .returning();
    expect(row.body).toContain("Warm white");

    await expect(
      testDb.insert(note).values({
        spaceId: space.id,
        sectionId: sections.daily.id,
        sectionKind: "daily",
        title: "Not allowed",
      }),
    ).rejects.toThrow();
  });

  it("rejects a system Section kind marked as custom", async () => {
    const { space } = await seedSpace();
    await expect(
      testDb.insert(section).values({
        spaceId: space.id,
        name: "Sneaky Monthlies",
        kind: "monthlies",
        isSystem: false,
        sortOrder: 5,
      }),
    ).rejects.toThrow();
  });
});
