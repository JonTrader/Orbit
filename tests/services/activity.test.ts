import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, space, spaceMember, user } from "@/lib/db/schema";
import {
  listActivity,
  listEntityActivity,
  listMonthlyCompletions,
  recordActivity,
  type ActivityDetails,
} from "@/lib/services/activity";
import { completeMonthly, createMonthly } from "@/lib/services/monthlies";

import { expectPostgresConstraint } from "../setup/assertions";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("recordActivity", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const actor = await createUser({ email: "actor@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    return { owner, actor, space };
  }

  it("inserts a row for an actor who is not a Member", async () => {
    const { actor, space } = await seedSpace();
    const entityId = randomUUID();
    const membership = await testDb
      .select({ id: spaceMember.id })
      .from(spaceMember)
      .where(eq(spaceMember.userId, actor.id));
    expect(membership).toEqual([]);

    const before = Date.now();
    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "task",
      entityId,
      action: "created",
      details: { title: "Paint colours" },
    });

    const [row] = await testDb
      .select()
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row).toMatchObject({
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "task",
      entityId,
      action: "created",
      period: null,
      details: { title: "Paint colours" },
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(row!.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("round-trips jsonb details", async () => {
    const { actor, space } = await seedSpace();
    const entityId = randomUUID();
    const fromSectionId = randomUUID();
    const toSectionId = randomUUID();
    const details: ActivityDetails = {
      title: "Rent",
      changes: {
        title: { from: "Old rent", to: "Rent" },
        assigneeId: {
          from: actor.id,
          to: null,
          fromName: "Actor",
          toName: "Nobody",
        },
      },
      fromSectionId,
      toSectionId,
      fromSectionName: "Daily",
      toSectionName: "Errands",
      dueDayOfMonth: 15,
      previousNextDueOn: "2026-08-01",
      nextDueOn: "2026-09-01",
      previousLastCompletedAt: "2026-07-01T12:00:00.000Z",
      previousLastCompletedBy: actor.id,
      cause: "section_deleted",
      sectionName: "Projects",
    };

    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "task",
      entityId,
      action: "moved",
      details,
    });

    const [row] = await testDb
      .select({ details: activity.details })
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row?.details).toEqual(details);
  });

  it("stores a Monthly completion period as a date", async () => {
    const { actor, space } = await seedSpace();
    const entityId = randomUUID();
    const details: ActivityDetails = {
      title: "Rent",
      dueDayOfMonth: 1,
      previousNextDueOn: "2026-08-01",
      nextDueOn: "2026-09-01",
      previousLastCompletedAt: null,
      previousLastCompletedBy: null,
    };

    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "monthly",
      entityId,
      action: "completed",
      period: "2026-08-01",
      details,
    });

    const [row] = await testDb
      .select()
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row).toMatchObject({
      entityType: "monthly",
      action: "completed",
      period: "2026-08-01",
      details,
    });
  });

  it("allows a null actor", async () => {
    const { space } = await seedSpace();
    const entityId = randomUUID();

    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: null,
      entityType: "note",
      entityId,
      action: "deleted",
      details: { title: "Measurements" },
    });

    const [row] = await testDb
      .select({ actorUserId: activity.actorUserId })
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row?.actorUserId).toBeNull();
  });

  it("stores an entity id that is not a Task or Monthly", async () => {
    const { actor, space } = await seedSpace();
    const entityId = randomUUID();

    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "task",
      entityId,
      action: "deleted",
      details: { title: "Gone" },
    });

    const [row] = await testDb
      .select({ entityId: activity.entityId })
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row?.entityId).toBe(entityId);

    const foreignKeys = await testDb.execute<{ columnName: string }>(sql`
      select kcu.column_name as "columnName"
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'activity'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'entity_id'
    `);
    expect(foreignKeys.rows).toEqual([]);
  });

  it("writes on the caller transaction and rolls back with it", async () => {
    const { actor, space } = await seedSpace();
    const committedId = randomUUID();
    const rolledBackId = randomUUID();

    await testDb.transaction(async (tx) => {
      await recordActivity(tx, {
        spaceId: space.id,
        actorUserId: actor.id,
        entityType: "section",
        entityId: committedId,
        action: "updated",
        details: { title: "Errands" },
      });
    });

    await expect(
      testDb.transaction(async (tx) => {
        await recordActivity(tx, {
          spaceId: space.id,
          actorUserId: actor.id,
          entityType: "section",
          entityId: rolledBackId,
          action: "deleted",
          details: { title: "Errands", cause: "section_deleted" },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const rows = await testDb
      .select({ entityId: activity.entityId })
      .from(activity);
    expect(rows.map((row) => row.entityId)).toEqual([committedId]);
  });

  it("sets actor_user_id null when that user is deleted", async () => {
    const { actor, space } = await seedSpace();
    const entityId = randomUUID();

    await recordActivity(testDb, {
      spaceId: space.id,
      actorUserId: actor.id,
      entityType: "note",
      entityId,
      action: "updated",
      details: { title: "Paint colours" },
    });

    await testDb.delete(user).where(eq(user.id, actor.id));

    const [row] = await testDb
      .select({ actorUserId: activity.actorUserId })
      .from(activity)
      .where(eq(activity.entityId, entityId));

    expect(row?.actorUserId).toBeNull();
  });

  it("indexes created_at and id descending for keyset pagination", async () => {
    const indexes = await testDb.execute<{
      indexName: string;
      indexDef: string;
    }>(sql`
      select indexname as "indexName", indexdef as "indexDef"
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'activity'
        and indexname in (
          'activity_space_created_idx',
          'activity_entity_created_idx'
        )
    `);

    expect(indexes.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexName: "activity_space_created_idx",
          indexDef: expect.stringMatching(
            /space_id, created_at DESC.*id DESC/,
          ),
        }),
        expect.objectContaining({
          indexName: "activity_entity_created_idx",
          indexDef: expect.stringMatching(
            /entity_id, created_at DESC.*id DESC/,
          ),
        }),
      ]),
    );
  });

  it("rejects an unknown space id", async () => {
    const actor = await createUser({ email: "actor@orbit.test" });

    await expectPostgresConstraint(
      recordActivity(testDb, {
        spaceId: randomUUID(),
        actorUserId: actor.id,
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Orphan" },
      }),
      "23503",
      "activity_space_id_space_id_fk",
    );
  });

  it("rejects an unknown actor user id", async () => {
    const { space: home } = await seedSpace();

    await expectPostgresConstraint(
      recordActivity(testDb, {
        spaceId: home.id,
        actorUserId: "not-a-real-user-id",
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Orphan actor" },
      }),
      "23503",
      "activity_actor_user_id_user_id_fk",
    );
  });

  it("deletes Activity rows when the Space is deleted", async () => {
    const { actor, space: home } = await seedSpace();
    const entityId = randomUUID();

    await recordActivity(testDb, {
      spaceId: home.id,
      actorUserId: actor.id,
      entityType: "task",
      entityId,
      action: "created",
      details: { title: "Cascades" },
    });

    await testDb.delete(space).where(eq(space.id, home.id));

    const rows = await testDb
      .select({ id: activity.id })
      .from(activity)
      .where(eq(activity.entityId, entityId));
    expect(rows).toEqual([]);
  });
});

describe("activity reads", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedMembers() {
    const owner = await createUser({ email: "owner@orbit.test", name: "Owner" });
    const reader = await createUser({
      email: "reader@orbit.test",
      name: "Reader",
    });
    const outsider = await createUser({
      email: "outsider@orbit.test",
      name: "Outsider",
    });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: reader.id,
      role: "read-only",
    });
    return { owner, reader, outsider, home: seeded.space };
  }

  async function insertActivity(input: {
    spaceId: string;
    actorUserId: string | null;
    entityId?: string;
    entityType?: "task" | "monthly" | "note" | "section";
    action?:
      | "created"
      | "updated"
      | "completed"
      | "reopened"
      | "moved"
      | "assigned"
      | "deleted";
    title?: string;
    createdAt?: Date;
    id?: string;
    period?: string | null;
  }) {
    const [row] = await testDb
      .insert(activity)
      .values({
        id: input.id,
        spaceId: input.spaceId,
        actorUserId: input.actorUserId,
        entityType: input.entityType ?? "task",
        entityId: input.entityId ?? randomUUID(),
        action: input.action ?? "created",
        period: input.period ?? null,
        details: { title: input.title ?? "Paint colours" },
        createdAt: input.createdAt,
      })
      .returning();
    return row!;
  }

  it("returns this Space's rows to a read-only Member and omits another Space", async () => {
    const { owner, reader, home } = await seedMembers();
    const otherOwner = await createUser({
      email: "other@orbit.test",
      name: "Other",
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    const homeEntity = randomUUID();
    const otherEntity = randomUUID();

    await recordActivity(testDb, {
      spaceId: home.id,
      actorUserId: owner.id,
      entityType: "task",
      entityId: homeEntity,
      action: "created",
      details: { title: "Home task" },
    });
    await recordActivity(testDb, {
      spaceId: other.space.id,
      actorUserId: otherOwner.id,
      entityType: "task",
      entityId: otherEntity,
      action: "created",
      details: { title: "Other task" },
    });

    const page = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
    });

    expect(page.nextCursor).toBeNull();
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      spaceId: home.id,
      entityId: homeEntity,
      actorUserId: owner.id,
      actorName: "Owner",
      action: "created",
      entityType: "task",
      details: { title: "Home task" },
    });
    expect(page.entries[0]?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
    );

    const entityPage = await listEntityActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      entityType: "task",
      entityId: homeEntity,
    });
    expect(entityPage.entries.map((entry) => entry.entityId)).toEqual([
      homeEntity,
    ]);
  });

  it("returns a null actor name when the actor user is deleted", async () => {
    const { owner, reader, home } = await seedMembers();
    const entityId = randomUUID();

    await recordActivity(testDb, {
      spaceId: home.id,
      actorUserId: owner.id,
      entityType: "note",
      entityId,
      action: "updated",
      details: { title: "Paint colours" },
    });
    await testDb.delete(user).where(eq(user.id, owner.id));

    const page = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
    });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      entityId,
      actorUserId: null,
      actorName: null,
    });
  });

  it("rejects an outsider", async () => {
    const { owner, outsider, home } = await seedMembers();
    const entityId = randomUUID();
    await recordActivity(testDb, {
      spaceId: home.id,
      actorUserId: owner.id,
      entityType: "task",
      entityId,
      action: "created",
      details: { title: "Home task" },
    });

    await expect(
      listActivity(testDb, { userId: outsider.id, spaceId: home.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      listEntityActivity(testDb, {
        userId: outsider.id,
        spaceId: home.id,
        entityType: "task",
        entityId,
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      listMonthlyCompletions(testDb, {
        userId: outsider.id,
        spaceId: home.id,
        monthlyId: entityId,
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
  });

  it("returns an empty page for another Space's entity id", async () => {
    const { reader, home } = await seedMembers();
    const otherOwner = await createUser({
      email: "other@orbit.test",
      name: "Other",
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    const foreignTaskId = randomUUID();
    const foreignMonthlyId = randomUUID();

    await recordActivity(testDb, {
      spaceId: other.space.id,
      actorUserId: otherOwner.id,
      entityType: "task",
      entityId: foreignTaskId,
      action: "updated",
      details: { title: "Other task" },
    });
    await recordActivity(testDb, {
      spaceId: other.space.id,
      actorUserId: otherOwner.id,
      entityType: "monthly",
      entityId: foreignMonthlyId,
      action: "completed",
      period: "2026-01-01",
      details: { title: "Other rent" },
    });

    await expect(
      listEntityActivity(testDb, {
        userId: reader.id,
        spaceId: home.id,
        entityType: "task",
        entityId: foreignTaskId,
      }),
    ).resolves.toEqual({ entries: [], nextCursor: null });
    await expect(
      listMonthlyCompletions(testDb, {
        userId: reader.id,
        spaceId: home.id,
        monthlyId: foreignMonthlyId,
      }),
    ).resolves.toEqual({ entries: [], nextCursor: null });
  });

  it("returns the next page without overlap and a null cursor on a short page", async () => {
    const { reader, home } = await seedMembers();
    const same = new Date("2026-03-03T15:00:00.000Z");
    const earlier = new Date("2026-03-01T15:00:00.000Z");
    const high = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const low = "00000000-0000-4000-8000-000000000001";
    const oldest = "11111111-1111-4111-8111-111111111111";

    await insertActivity({
      id: high,
      spaceId: home.id,
      actorUserId: reader.id,
      createdAt: same,
      title: "Newer high",
    });
    await insertActivity({
      id: low,
      spaceId: home.id,
      actorUserId: reader.id,
      createdAt: same,
      title: "Newer low",
    });
    await insertActivity({
      id: oldest,
      spaceId: home.id,
      actorUserId: reader.id,
      createdAt: earlier,
      title: "Older",
    });

    const first = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 2,
    });
    expect(first.entries.map((entry) => entry.id)).toEqual([high, low]);
    expect(first.entries[0]?.createdAt).toBe(first.entries[1]?.createdAt);
    expect(first.nextCursor).toEqual({
      createdAt: first.entries[1]?.createdAt,
      id: low,
    });

    const second = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.entries.map((entry) => entry.id)).toEqual([oldest]);
    expect(second.nextCursor).toBeNull();

    const tie = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 1,
    });
    expect(tie.entries.map((entry) => entry.id)).toEqual([high]);
    const tieNext = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 1,
      cursor: tie.nextCursor!,
    });
    expect(tieNext.entries.map((entry) => entry.id)).toEqual([low]);
  });

  it("does not follow a cursor into another Space", async () => {
    const { reader, home } = await seedMembers();
    const otherOwner = await createUser({
      email: "other@orbit.test",
      name: "Other",
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    const homeRow = await insertActivity({
      spaceId: home.id,
      actorUserId: reader.id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      title: "Home",
    });
    await insertActivity({
      spaceId: other.space.id,
      actorUserId: otherOwner.id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      title: "Foreign",
    });
    await insertActivity({
      spaceId: other.space.id,
      actorUserId: otherOwner.id,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      title: "Newer foreign",
    });

    const foreignPage = await listActivity(testDb, {
      userId: otherOwner.id,
      spaceId: other.space.id,
      limit: 1,
    });
    expect(foreignPage.nextCursor).not.toBeNull();

    const page = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      cursor: foreignPage.nextCursor!,
    });

    expect(page.entries.map((entry) => entry.id)).toEqual([homeRow.id]);
    expect(page.entries.every((entry) => entry.spaceId === home.id)).toBe(
      true,
    );
  });

  it("returns Monthly completions newest first", async () => {
    const { owner, reader, home } = await seedMembers();
    const created = await createMonthly(testDb, {
      userId: owner.id,
      spaceId: home.id,
      title: "Rent",
      dueDayOfMonth: 1,
    });
    const first = await completeMonthly(testDb, {
      userId: owner.id,
      spaceId: home.id,
      monthlyId: created.id,
    });
    await completeMonthly(testDb, {
      userId: owner.id,
      spaceId: home.id,
      monthlyId: created.id,
    });

    const page = await listMonthlyCompletions(testDb, {
      userId: reader.id,
      spaceId: home.id,
      monthlyId: created.id,
    });

    expect(page.nextCursor).toBeNull();
    expect(page.entries.map((entry) => entry.action)).toEqual([
      "completed",
      "completed",
    ]);
    expect(page.entries.map((entry) => entry.period)).toEqual([
      first.nextDueOn,
      created.nextDueOn,
    ]);
    expect(page.entries[0]).toMatchObject({
      entityType: "monthly",
      entityId: created.id,
      actorUserId: owner.id,
      actorName: "Owner",
      spaceId: home.id,
    });
    expect(
      page.entries[0]!.createdAt >= page.entries[1]!.createdAt,
    ).toBe(true);
  });

  it("clamps limit to 1..100 and defaults to 40", async () => {
    const { reader, home } = await seedMembers();
    const inserted = await testDb
      .insert(activity)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          spaceId: home.id,
          actorUserId: reader.id,
          entityType: "note" as const,
          entityId: randomUUID(),
          action: "created" as const,
          details: { title: `Note ${index}` },
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        })),
      )
      .returning({ id: activity.id, createdAt: activity.createdAt });
    const expectedIds = inserted
      .slice()
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1),
      )
      .map((row) => row.id);

    const defaults = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
    });
    expect(defaults.entries.map((entry) => entry.id)).toEqual(
      expectedIds.slice(0, 40),
    );
    expect(defaults.nextCursor).toEqual({
      createdAt: defaults.entries[39]?.createdAt,
      id: expectedIds[39],
    });

    const clamped = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 250,
    });
    expect(clamped.entries.map((entry) => entry.id)).toEqual(
      expectedIds.slice(0, 100),
    );

    const rest = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 250,
      cursor: clamped.nextCursor!,
    });
    expect(rest.entries.map((entry) => entry.id)).toEqual(
      expectedIds.slice(100),
    );
    expect(rest.nextCursor).toBeNull();

    const single = await listActivity(testDb, {
      userId: reader.id,
      spaceId: home.id,
      limit: 0,
    });
    expect(single.entries.map((entry) => entry.id)).toEqual(
      expectedIds.slice(0, 1),
    );
    expect(single.nextCursor).toEqual({
      createdAt: single.entries[0]?.createdAt,
      id: expectedIds[0],
    });
  });
});
