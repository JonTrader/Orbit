import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, monthly, spaceMember } from "@/lib/db/schema";
import {
  completeMonthly,
  createMonthly,
  deleteMonthly,
  getMonthly,
  listMonthlies,
  MonthlyError,
  updateMonthly,
} from "@/lib/services/monthlies";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Monthly services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const assignee = await createUser({
      email: "assignee@orbit.test",
      name: "Assignee",
    });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
      { spaceId: seeded.space.id, userId: assignee.id, role: "read-only" },
    ]);

    return { owner, editor, readOnly, assignee, outsider, ...seeded };
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

  async function spaceActivity(spaceId: string) {
    return testDb.select().from(activity).where(eq(activity.spaceId, spaceId));
  }

  it("creates, lists, gets, updates, and deletes Monthlies", async () => {
    const { space, editor, readOnly, assignee } = await seedSpace();

    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: " Rent ",
      dueDayOfMonth: 15,
      assigneeId: assignee.id,
    });

    expect(created).toMatchObject({
      sectionKind: "monthlies",
      title: "Rent",
      dueDayOfMonth: 15,
      assigneeId: assignee.id,
      createdBy: editor.id,
    });
    expect(created.nextDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(
      listMonthlies(testDb, { userId: readOnly.id, spaceId: space.id }),
    ).resolves.toMatchObject([{ id: created.id, title: "Rent" }]);
    await expect(
      getMonthly(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        monthlyId: created.id,
      }),
    ).resolves.toMatchObject({ id: created.id });

    const updated = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      title: "Mortgage",
      assigneeId: null,
    });
    expect(updated).toMatchObject({ title: "Mortgage", assigneeId: null });

    await expect(
      deleteMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: created.id,
      }),
    ).resolves.toMatchObject({ id: created.id });
    await expect(
      getMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: created.id,
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_NOT_FOUND" });
  });

  it("creates, defaults, updates, and clears plain-text Monthly bodies", async () => {
    const { space, editor, readOnly } = await seedSpace();
    const description = "First line\nSecond line <kept as plain text>";

    const described = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Described",
      body: description,
      dueDayOfMonth: 10,
    });
    expect(described.body).toBe(description);

    await expect(
      getMonthly(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        monthlyId: described.id,
      }),
    ).resolves.toMatchObject({ body: description });

    const defaulted = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "No description",
      dueDayOfMonth: 20,
    });
    expect(defaulted.body).toBe("");

    const cleared = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: described.id,
      body: "",
    });
    expect(cleared.body).toBe("");
  });

  it("completes a Monthly and clamps day 31 to the end of February", async () => {
    const { space, editor, sections } = await seedSpace();
    const [created] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
        dueDayOfMonth: 31,
        nextDueOn: "2026-01-31",
        createdBy: editor.id,
      })
      .returning();

    const completed = await completeMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });

    expect(completed.nextDueOn).toBe("2026-02-28");
    expect(completed.dueDayOfMonth).toBe(31);
    expect(completed.lastCompletedAt).toBeInstanceOf(Date);
    expect(completed.lastCompletedBy).toBe(editor.id);
  });

  it("advances a Monthly from December into January", async () => {
    const { space, editor, sections } = await seedSpace();
    const [created] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Insurance",
        dueDayOfMonth: 30,
        nextDueOn: "2026-12-30",
        createdBy: editor.id,
      })
      .returning();

    const completed = await completeMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });

    expect(completed.nextDueOn).toBe("2027-01-30");
  });

  it("allows changing the authored due day and recalculates the next due date", async () => {
    const { space, editor } = await seedSpace();
    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Statement",
      dueDayOfMonth: 5,
    });

    const updated = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      dueDayOfMonth: 31,
    });

    expect(updated.dueDayOfMonth).toBe(31);
    expect(updated.nextDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("schedules a past due-day this month onto the next month", async () => {
    const { space, editor } = await seedSpace();
    // America/Chicago is behind UTC in March; pin wall time after the 15th locally.
    const now = new Date("2026-03-20T18:00:00.000Z");

    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Past due day",
      dueDayOfMonth: 15,
      now,
    });

    expect(created.nextDueOn).toBe("2026-04-15");
  });

  it("clamps day 31 to the last day of the current short month on create", async () => {
    const { space, editor } = await seedSpace();
    const now = new Date("2026-02-10T18:00:00.000Z");

    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "End of February",
      dueDayOfMonth: 31,
      now,
    });

    expect(created.dueDayOfMonth).toBe(31);
    expect(created.nextDueOn).toBe("2026-02-28");
  });

  it("advances day 31 into leap-year February as the 29th", async () => {
    const { space, editor, sections } = await seedSpace();
    const [created] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Leap rent",
        dueDayOfMonth: 31,
        nextDueOn: "2028-01-31",
        createdBy: editor.id,
      })
      .returning();

    const completed = await completeMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });

    expect(completed.nextDueOn).toBe("2028-02-29");
  });

  it("rejects invalid due days, invalid assignees, and empty updates", async () => {
    const { space, editor, outsider } = await seedSpace();

    for (const dueDayOfMonth of [0, 32, 1.5]) {
      await expect(
        createMonthly(testDb, {
          userId: editor.id,
          spaceId: space.id,
          title: "Invalid",
          dueDayOfMonth,
        }),
      ).rejects.toMatchObject({ code: "INVALID_DUE_DAY" });
    }

    await expect(
      createMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        title: "Cross-space",
        dueDayOfMonth: 1,
        assigneeId: outsider.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });

    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "No changes",
      dueDayOfMonth: 1,
    });
    await expect(
      updateMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: created.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_UPDATE" });
  });

  it("denies Monthly mutations to read-only Members", async () => {
    const { space, editor, readOnly } = await seedSpace();
    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Protected",
      dueDayOfMonth: 1,
    });

    for (const action of [
      () =>
        createMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          title: "Nope",
          dueDayOfMonth: 1,
        }),
      () =>
        updateMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
          title: "Nope",
        }),
      () =>
        completeMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
        }),
      () =>
        deleteMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
        }),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }
  });

  it("rejects non-member reads and cross-Space Monthly lookups", async () => {
    const { space, editor, outsider } = await seedSpace();
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
    const otherMonthly = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      title: "Other Space Monthly",
      dueDayOfMonth: 10,
    });
    const homeMonthly = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Home Monthly",
      dueDayOfMonth: 5,
    });

    await expect(
      listMonthlies(testDb, { userId: outsider.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      getMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: otherMonthly.id,
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_NOT_FOUND" });
    await expect(
      getMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: homeMonthly.id,
      }),
    ).resolves.toMatchObject({ id: homeMonthly.id });
  });

  it("keeps Monthly rows tied to the Monthlies Section", async () => {
    const { space, sections, editor } = await seedSpace();
    const [created] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Protected classification",
        dueDayOfMonth: 1,
        nextDueOn: "2026-08-01",
        createdBy: editor.id,
      })
      .returning();

    await expect(
      testDb
        .update(monthly)
        .set({ sectionId: sections.daily.id, sectionKind: "daily" })
        .where(eq(monthly.id, created.id)),
    ).rejects.toMatchObject({
      cause: { code: "23514", constraint: "monthly_section_kind_allowed" },
    });
  });

  it("exposes a structured Monthly error for invalid titles", async () => {
    const { space, editor } = await seedSpace();

    await expect(
      createMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        title: " ",
        dueDayOfMonth: 1,
      }),
    ).rejects.toBeInstanceOf(MonthlyError);
  });

  it("records created Activity and nothing when create is denied", async () => {
    const { space, editor, readOnly, outsider } = await seedSpace();
    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "  Rent  ",
      dueDayOfMonth: 15,
    });

    const rows = await activityFor(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "monthly",
      entityId: created.id,
      action: "created",
      period: null,
    });
    expect(rows[0]?.details).toEqual({ title: "Rent" });

    await expect(
      createMonthly(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        title: "Nope",
        dueDayOfMonth: 1,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      createMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        title: "Stranger",
        dueDayOfMonth: 1,
        assigneeId: outsider.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ASSIGNEE" });
    for (const denied of [
      () =>
        updateMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
          title: "Nope",
        }),
      () =>
        completeMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
        }),
      () =>
        deleteMonthly(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          monthlyId: created.id,
        }),
    ]) {
      await expect(denied()).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    }
    expect(await spaceActivity(space.id)).toEqual(rows);

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
    const otherMonthly = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      title: "Other rent",
      dueDayOfMonth: 4,
    });
    const otherRows = await activityFor(otherMonthly.id);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0]?.spaceId).toBe(other.space.id);

    await expect(
      updateMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: otherMonthly.id,
        title: "Hijack",
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_NOT_FOUND" });
    await expect(
      completeMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: otherMonthly.id,
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_NOT_FOUND" });
    await expect(
      deleteMonthly(testDb, {
        userId: editor.id,
        spaceId: space.id,
        monthlyId: otherMonthly.id,
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_NOT_FOUND" });

    expect(await activityFor(otherMonthly.id)).toEqual(otherRows);
    expect(await spaceActivity(space.id)).toEqual(rows);
    expect(
      (await spaceActivity(space.id)).some((row) => row.entityId === otherMonthly.id),
    ).toBe(false);
  });

  it("records assigned or updated only when stored Monthly values change", async () => {
    const { space, editor, assignee } = await seedSpace();
    const now = new Date("2026-11-09T18:00:00.000Z");
    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Rent",
      dueDayOfMonth: 15,
      now,
    });
    expect(created.nextDueOn).toBe("2026-11-15");

    const assigned = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      assigneeId: assignee.id,
    });
    expect(assigned.assigneeId).toBe(assignee.id);
    const assignedRows = (await activityFor(created.id)).filter(
      (row) => row.action === "assigned",
    );
    expect(assignedRows).toHaveLength(1);
    expect(assignedRows[0]).toMatchObject({
      actorUserId: editor.id,
      entityType: "monthly",
      entityId: created.id,
      period: null,
    });
    expect(assignedRows[0]?.details).toEqual({
      title: "Rent",
      changes: {
        assigneeId: { from: null, to: assignee.id, toName: "Assignee" },
      },
    });

    const beforeTitle = await activityFor(created.id);
    const retitled = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      title: "  Mortgage  ",
    });
    expect(retitled.title).toBe("Mortgage");
    const titleRows = addedActivity(beforeTitle, await activityFor(created.id));
    expect(titleRows).toHaveLength(1);
    expect(titleRows[0]).toMatchObject({
      action: "updated",
      actorUserId: editor.id,
    });
    expect(titleRows[0]?.details).toEqual({
      title: "Mortgage",
      changes: { title: { from: "Rent", to: "Mortgage" } },
    });

    const beforeBoth = await activityFor(created.id);
    await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      title: "Lease",
      assigneeId: null,
    });
    const bothRows = addedActivity(beforeBoth, await activityFor(created.id));
    expect(bothRows).toHaveLength(1);
    expect(bothRows[0]).toMatchObject({ action: "updated", actorUserId: editor.id });
    expect(bothRows[0]?.details).toEqual({
      title: "Lease",
      changes: {
        title: { from: "Mortgage", to: "Lease" },
        assigneeId: { from: assignee.id, to: null, fromName: "Assignee" },
      },
    });
    expect(bothRows.filter((row) => row.action === "assigned")).toEqual([]);

    const beforeSame = await activityFor(created.id);
    await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      title: "Lease",
      body: "",
      assigneeId: null,
      dueDayOfMonth: 15,
      now,
    });
    await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      title: "  Lease  ",
    });
    expect(await activityFor(created.id)).toEqual(beforeSame);

    await testDb
      .update(monthly)
      .set({ nextDueOn: "2020-01-15" })
      .where(eq(monthly.id, created.id));
    const beforeDue = await activityFor(created.id);
    const recomputed = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      dueDayOfMonth: 15,
      now,
    });
    expect(recomputed.dueDayOfMonth).toBe(15);
    expect(recomputed.nextDueOn).toBe("2026-11-15");
    expect(await activityFor(created.id)).toEqual(beforeDue);

    const changed = await updateMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
      dueDayOfMonth: 20,
      now,
    });
    expect(changed.nextDueOn).toBe("2026-11-20");
    const dueRows = addedActivity(beforeDue, await activityFor(created.id));
    expect(dueRows).toHaveLength(1);
    expect(dueRows[0]).toMatchObject({ action: "updated", actorUserId: editor.id });
    expect(dueRows[0]?.details).toEqual({
      title: "Lease",
      changes: { dueDayOfMonth: { from: 15, to: 20 } },
    });
  });

  it("records each Monthly completion without overwriting the previous row", async () => {
    const { space, sections, owner, editor } = await seedSpace();
    const [created] = await testDb
      .insert(monthly)
      .values({
        spaceId: space.id,
        sectionId: sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
        dueDayOfMonth: 31,
        nextDueOn: "2026-01-31",
        createdBy: owner.id,
      })
      .returning();

    const first = await completeMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });
    expect(first.nextDueOn).toBe("2026-02-28");
    expect(first.lastCompletedBy).toBe(editor.id);

    const firstRows = await activityFor(created.id);
    expect(firstRows).toHaveLength(1);
    expect(firstRows[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "monthly",
      entityId: created.id,
      action: "completed",
      period: "2026-01-31",
    });
    expect(firstRows[0]?.details).toEqual({
      title: "Rent",
      dueDayOfMonth: 31,
      previousNextDueOn: "2026-01-31",
      nextDueOn: "2026-02-28",
      previousLastCompletedAt: null,
      previousLastCompletedBy: null,
    });

    const second = await completeMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });
    expect(second.nextDueOn).toBe("2026-03-31");

    const completions = await testDb
      .select()
      .from(activity)
      .where(
        and(eq(activity.entityId, created.id), eq(activity.action, "completed")),
      )
      .orderBy(desc(activity.createdAt), desc(activity.id));
    expect(completions.map((row) => row.period)).toEqual([
      "2026-02-28",
      "2026-01-31",
    ]);
    expect(completions[1]).toEqual(firstRows[0]);
    expect(completions[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "monthly",
      entityId: created.id,
      action: "completed",
      period: "2026-02-28",
    });
    expect(completions[0]?.details).toEqual({
      title: "Rent",
      dueDayOfMonth: 31,
      previousNextDueOn: "2026-02-28",
      nextDueOn: "2026-03-31",
      previousLastCompletedAt: first.lastCompletedAt?.toISOString() ?? null,
      previousLastCompletedBy: editor.id,
    });
  });

  it("keeps deleted Activity after the Monthly row is gone", async () => {
    const { space, editor } = await seedSpace();
    const created = await createMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      title: "Throw away",
      dueDayOfMonth: 3,
    });

    const deleted = await deleteMonthly(testDb, {
      userId: editor.id,
      spaceId: space.id,
      monthlyId: created.id,
    });
    expect(deleted.id).toBe(created.id);
    expect(
      await testDb.select().from(monthly).where(eq(monthly.id, created.id)),
    ).toEqual([]);

    const rows = await activityFor(created.id);
    expect(rows.map((row) => row.action).sort()).toEqual(["created", "deleted"]);
    expect(rows.find((row) => row.action === "deleted")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "monthly",
      entityId: created.id,
      action: "deleted",
      period: null,
      details: { title: "Throw away" },
    });
  });
});
