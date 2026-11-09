import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, space, spaceMember, user } from "@/lib/db/schema";
import {
  recordActivity,
  type ActivityDetails,
} from "@/lib/services/activity";

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
