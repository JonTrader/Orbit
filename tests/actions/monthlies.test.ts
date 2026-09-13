import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { deleteMonthly, updateMonthly } from "@/lib/actions/monthlies";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { monthly, spaceMember } from "@/lib/db/schema";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededMonthly {
  ownerId: string;
  editorId: string;
  readOnlyId: string;
  outsiderId: string;
  spaceId: string;
  monthlyId: string;
}

async function seedMonthly(
  overrides: Partial<typeof monthly.$inferInsert> = {},
): Promise<SeededMonthly> {
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
    .insert(monthly)
    .values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.monthlies.id,
      sectionKind: "monthlies",
      title: "Original title",
      body: "Original body",
      dueDayOfMonth: 15,
      nextDueOn: "2030-06-15",
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
    monthlyId: created.id,
  };
}

async function seedMonthlyInOtherSpace(ownerId: string) {
  const other = await createSpaceWithSystemSections(testDb, {
    name: "Other",
    ownerUserId: ownerId,
  });
  const [created] = await testDb
    .insert(monthly)
    .values({
      spaceId: other.space.id,
      sectionId: other.sections.monthlies.id,
      sectionKind: "monthlies",
      title: "Other Space Monthly",
      body: "Secret",
      dueDayOfMonth: 1,
      nextDueOn: "2030-06-01",
      createdBy: ownerId,
    })
    .returning();
  return created;
}

describe("updateMonthly action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("updates a Monthly's title, body, and due day and revalidates the Space layout", async () => {
    const s = await seedMonthly();
    authenticateAs(s.editorId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      title: "  Renamed  ",
      body: "New body",
      dueDayOfMonth: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Renamed");
    expect(result.data.body).toBe("New body");
    expect(result.data.dueDayOfMonth).toBe(20);
    expect(result.data.nextDueOn).toMatch(/-20$/);

    const [row] = await testDb.select().from(monthly);
    expect(row.title).toBe("Renamed");
    expect(row.body).toBe("New body");
    expect(row.dueDayOfMonth).toBe(20);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("clears the body to an empty string, leaving the title untouched", async () => {
    const s = await seedMonthly();
    authenticateAs(s.editorId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      body: "",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Original title");
    expect(result.data.body).toBe("");
    expect(result.data.dueDayOfMonth).toBe(15);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("rejects a whitespace-only title as a validation error", async () => {
    const s = await seedMonthly();
    authenticateAs(s.ownerId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      title: "   ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["title"]);
    }
    const [row] = await testDb.select().from(monthly);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range due day as a validation error", async () => {
    const s = await seedMonthly();
    authenticateAs(s.ownerId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      dueDayOfMonth: 32,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["dueDayOfMonth"]);
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an update with no fields", async () => {
    const s = await seedMonthly();
    authenticateAs(s.ownerId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects unknown monthly ids with MONTHLY_NOT_FOUND", async () => {
    const s = await seedMonthly();
    authenticateAs(s.ownerId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: crypto.randomUUID(),
      title: "Ghost",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MONTHLY_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks read-only Members from editing Monthlies", async () => {
    const s = await seedMonthly();
    authenticateAs(s.readOnlyId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      title: "Read-only attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    const [row] = await testDb.select().from(monthly);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedMonthly();
    authenticateAs(s.outsiderId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
      title: "Outsider attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a Monthly that does not belong to the given Space", async () => {
    const s = await seedMonthly();
    const otherMonthly = await seedMonthlyInOtherSpace(s.ownerId);
    authenticateAs(s.ownerId);

    const result = await updateMonthly({
      spaceId: s.spaceId,
      monthlyId: otherMonthly.id,
      title: "Stolen",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MONTHLY_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});

describe("deleteMonthly action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("deletes a Monthly and revalidates the Space layout", async () => {
    const s = await seedMonthly();
    authenticateAs(s.editorId);

    const result = await deleteMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the delete to succeed");
    expect(result.data.id).toBe(s.monthlyId);
    expect(await testDb.select().from(monthly)).toHaveLength(0);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("rejects unknown monthly ids with MONTHLY_NOT_FOUND", async () => {
    const s = await seedMonthly();
    authenticateAs(s.ownerId);

    const result = await deleteMonthly({
      spaceId: s.spaceId,
      monthlyId: crypto.randomUUID(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MONTHLY_NOT_FOUND");
    }
    expect(await testDb.select().from(monthly)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks read-only Members from deleting Monthlies", async () => {
    const s = await seedMonthly();
    authenticateAs(s.readOnlyId);

    const result = await deleteMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    expect(await testDb.select().from(monthly)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedMonthly();
    authenticateAs(s.outsiderId);

    const result = await deleteMonthly({
      spaceId: s.spaceId,
      monthlyId: s.monthlyId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(await testDb.select().from(monthly)).toHaveLength(1);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a Monthly that does not belong to the given Space", async () => {
    const s = await seedMonthly();
    const otherMonthly = await seedMonthlyInOtherSpace(s.ownerId);
    authenticateAs(s.ownerId);

    const result = await deleteMonthly({
      spaceId: s.spaceId,
      monthlyId: otherMonthly.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MONTHLY_NOT_FOUND");
    }
    expect(await testDb.select().from(monthly)).toHaveLength(2);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
