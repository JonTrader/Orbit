import "../setup/api-mocks";
import "../setup/action-mocks";

import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  listActivity,
  listEntityActivity,
} from "@/lib/actions/activity";
import { updateTask } from "@/lib/actions/tasks";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, spaceMember, task } from "@/lib/db/schema";
import { spaceLayoutPath } from "@/lib/spaces/paths";

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
  dailySectionId: string;
}

async function seedSpace(): Promise<SeededSpace> {
  const owner = await createUser({ email: "owner@orbit.test", name: "Owner" });
  const editor = await createUser({
    email: "editor@orbit.test",
    name: "Editor",
  });
  const readOnly = await createUser({
    email: "read-only@orbit.test",
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
    dailySectionId: seeded.sections.daily.id,
  };
}

describe("activity actions", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("lets a read-only Member list Activity without revalidating", async () => {
    const s = await seedSpace();
    const entityId = randomUUID();
    await testDb.insert(activity).values({
      spaceId: s.spaceId,
      actorUserId: s.ownerId,
      entityType: "task",
      entityId,
      action: "created",
      details: { title: "Paint colours" },
    });
    authenticateAs(s.readOnlyId);

    const spacePage = await listActivity({ spaceId: s.spaceId });
    const entityPage = await listEntityActivity({
      spaceId: s.spaceId,
      entityType: "task",
      entityId,
    });

    expect(spacePage.ok).toBe(true);
    if (!spacePage.ok) throw new Error("Expected the Space list to succeed");
    expect(entityPage.ok).toBe(true);
    if (!entityPage.ok) throw new Error("Expected the entity list to succeed");
    expect(spacePage.data.entries).toHaveLength(1);
    expect(spacePage.data.entries[0]).toMatchObject({
      spaceId: s.spaceId,
      entityId,
      actorUserId: s.ownerId,
      actorName: "Owner",
      action: "created",
    });
    expect(entityPage.data.entries.map((entry) => entry.id)).toEqual([
      spacePage.data.entries[0]?.id,
    ]);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an outsider", async () => {
    const s = await seedSpace();
    authenticateAs(s.outsiderId);
    const entityId = randomUUID();

    const spacePage = await listActivity({ spaceId: s.spaceId });
    const entityPage = await listEntityActivity({
      spaceId: s.spaceId,
      entityType: "note",
      entityId,
    });

    expect(spacePage.ok).toBe(false);
    if (spacePage.ok) throw new Error("Expected NOT_MEMBER");
    expect(spacePage.error.code).toBe("NOT_MEMBER");
    expect(entityPage.ok).toBe(false);
    if (entityPage.ok) throw new Error("Expected NOT_MEMBER");
    expect(entityPage.error.code).toBe("NOT_MEMBER");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("does not leak another Space through membership, entity id, or cursor", async () => {
    const home = await seedSpace();
    const otherOwner = await createUser({
      email: "other@orbit.test",
      name: "Other",
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    const foreignTaskId = randomUUID();
    await testDb.insert(activity).values([
      {
        spaceId: other.space.id,
        actorUserId: otherOwner.id,
        entityType: "task",
        entityId: foreignTaskId,
        action: "created",
        details: { title: "Foreign" },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        spaceId: other.space.id,
        actorUserId: otherOwner.id,
        entityType: "note",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Newer foreign" },
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);
    const [homeRow] = await testDb
      .insert(activity)
      .values({
        spaceId: home.spaceId,
        actorUserId: home.ownerId,
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Home" },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning();

    authenticateAs(home.readOnlyId);
    const listingOther = await listActivity({ spaceId: other.space.id });
    expect(listingOther.ok).toBe(false);
    if (listingOther.ok) throw new Error("Expected NOT_MEMBER");
    expect(listingOther.error.code).toBe("NOT_MEMBER");

    const foreignEntity = await listEntityActivity({
      spaceId: home.spaceId,
      entityType: "task",
      entityId: foreignTaskId,
    });
    expect(foreignEntity.ok).toBe(true);
    if (!foreignEntity.ok) throw new Error("Expected an empty page");
    expect(foreignEntity.data).toEqual({ entries: [], nextCursor: null });

    authenticateAs(otherOwner.id);
    const foreignPage = await listActivity({
      spaceId: other.space.id,
      limit: 1,
    });
    expect(foreignPage.ok).toBe(true);
    if (!foreignPage.ok) throw new Error("Expected the foreign page");
    expect(foreignPage.data.nextCursor).not.toBeNull();

    authenticateAs(home.readOnlyId);
    const replay = await listActivity({
      spaceId: home.spaceId,
      cursor: foreignPage.data.nextCursor!,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error("Expected the home page");
    expect(replay.data.entries.map((entry) => entry.id)).toEqual([homeRow.id]);
    expect(replay.data.entries.every((entry) => entry.spaceId === home.spaceId)).toBe(
      true,
    );
  });

  it("returns the next page without overlap", async () => {
    const s = await seedSpace();
    const same = new Date("2026-03-03T15:00:00.000Z");
    const earlier = new Date("2026-03-01T15:00:00.000Z");
    const high = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const low = "00000000-0000-4000-8000-000000000001";
    const oldest = "11111111-1111-4111-8111-111111111111";
    await testDb.insert(activity).values([
      {
        id: high,
        spaceId: s.spaceId,
        actorUserId: s.ownerId,
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Newer high" },
        createdAt: same,
      },
      {
        id: low,
        spaceId: s.spaceId,
        actorUserId: s.ownerId,
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Newer low" },
        createdAt: same,
      },
      {
        id: oldest,
        spaceId: s.spaceId,
        actorUserId: s.ownerId,
        entityType: "task",
        entityId: randomUUID(),
        action: "created",
        details: { title: "Older" },
        createdAt: earlier,
      },
    ]);
    authenticateAs(s.readOnlyId);

    const first = await listActivity({ spaceId: s.spaceId, limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected the first page to succeed");
    expect(first.data.entries.map((entry) => entry.id)).toEqual([high, low]);
    expect(first.data.nextCursor).not.toBeNull();

    const second = await listActivity({
      spaceId: s.spaceId,
      limit: 2,
      cursor: first.data.nextCursor!,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Expected the second page to succeed");
    expect(second.data.entries.map((entry) => entry.id)).toEqual([oldest]);
    expect(second.data.nextCursor).toBeNull();
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a limit of 0 or 101", async () => {
    authenticateAs("reader");
    const spaceId = randomUUID();
    const entityId = randomUUID();

    for (const limit of [0, 101]) {
      const spacePage = await listActivity({ spaceId, limit });
      expect(spacePage.ok).toBe(false);
      if (spacePage.ok) throw new Error("Expected validation to fail");
      expect(spacePage.error.code).toBe("VALIDATION_ERROR");

      const entityPage = await listEntityActivity({
        spaceId,
        entityType: "task",
        entityId,
        limit,
      });
      expect(entityPage.ok).toBe(false);
      if (entityPage.ok) throw new Error("Expected validation to fail");
      expect(entityPage.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("shows the Activity row written by updateTask and does not revalidate the read", async () => {
    const s = await seedSpace();
    const [created] = await testDb
      .insert(task)
      .values({
        spaceId: s.spaceId,
        sectionId: s.dailySectionId,
        sectionKind: "daily",
        title: "Original title",
        createdBy: s.ownerId,
      })
      .returning();
    authenticateAs(s.editorId);

    const updated = await updateTask({
      spaceId: s.spaceId,
      taskId: created.id,
      title: "Renamed",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("Expected the update to succeed");

    const history = await listEntityActivity({
      spaceId: s.spaceId,
      entityType: "task",
      entityId: created.id,
    });
    expect(history.ok).toBe(true);
    if (!history.ok) throw new Error("Expected history to succeed");
    expect(history.data.entries).toEqual([
      expect.objectContaining({
        spaceId: s.spaceId,
        entityType: "task",
        entityId: created.id,
        action: "updated",
        actorUserId: s.editorId,
        actorName: "Editor",
        details: expect.objectContaining({ title: "Renamed" }),
      }),
    ]);
    expect(history.data.nextCursor).toBeNull();
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });
});
