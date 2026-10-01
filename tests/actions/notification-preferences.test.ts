import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  getNotificationPreference,
  updateNotificationPreference,
} from "@/lib/actions/notification-preferences";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededPreference {
  ownerId: string;
  readOnlyId: string;
  outsiderId: string;
  spaceId: string;
}

async function seedSpace(): Promise<SeededPreference> {
  const owner = await createUser({ email: "owner@orbit.test" });
  const readOnly = await createUser({ email: "read-only@orbit.test" });
  const outsider = await createUser({ email: "outsider@orbit.test" });
  const seeded = await createSpaceWithSystemSections(testDb, {
    name: "Home",
    ownerUserId: owner.id,
  });

  await testDb.insert(spaceMember).values({
    spaceId: seeded.space.id,
    userId: readOnly.id,
    role: "read-only",
  });

  return {
    ownerId: owner.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
  };
}

describe("notification preference actions", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("returns default preferences for a read-only Member without revalidating", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const result = await getNotificationPreference({ spaceId: s.spaceId });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the read to succeed");
    expect(result.data.userId).toBe(s.readOnlyId);
    expect(result.data.spaceId).toBe(s.spaceId);
    expect(result.data.daysBefore).toBe(3);
    expect(result.data.emailEnabled).toBe(true);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("updates a read-only Member's preference and revalidates the Space layout", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const result = await updateNotificationPreference({
      spaceId: s.spaceId,
      daysBefore: 5,
      emailEnabled: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.daysBefore).toBe(5);
    expect(result.data.emailEnabled).toBe(false);
    expect(result.data.userId).toBe(s.readOnlyId);

    const loaded = await getNotificationPreference({ spaceId: s.spaceId });

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("Expected the read to succeed");
    expect(loaded.data.daysBefore).toBe(5);
    expect(loaded.data.emailEnabled).toBe(false);
    expect(loaded.data.userId).toBe(s.readOnlyId);

    authenticateAs(s.ownerId);
    const owner = await getNotificationPreference({ spaceId: s.spaceId });

    expect(owner.ok).toBe(true);
    if (!owner.ok) throw new Error("Expected the Owner read to succeed");
    expect(owner.data.userId).toBe(s.ownerId);
    expect(owner.data.daysBefore).toBe(3);
    expect(owner.data.emailEnabled).toBe(true);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("updates daysBefore alone and leaves emailEnabled unchanged", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const disabled = await updateNotificationPreference({
      spaceId: s.spaceId,
      emailEnabled: false,
    });

    expect(disabled.ok).toBe(true);
    if (!disabled.ok) throw new Error("Expected the update to succeed");
    expect(disabled.data.emailEnabled).toBe(false);

    const result = await updateNotificationPreference({
      spaceId: s.spaceId,
      daysBefore: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.daysBefore).toBe(1);
    expect(result.data.emailEnabled).toBe(false);

    const loaded = await getNotificationPreference({ spaceId: s.spaceId });

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("Expected the read to succeed");
    expect(loaded.data.daysBefore).toBe(1);
    expect(loaded.data.emailEnabled).toBe(false);
  });

  it("rejects an update that only includes spaceId", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const result = await updateNotificationPreference({ spaceId: s.spaceId });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_UPDATE");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects invalid daysBefore and emailEnabled values", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    for (const daysBefore of [-1, 31, 1.5]) {
      const result = await updateNotificationPreference({
        spaceId: s.spaceId,
        daysBefore,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    }

    const invalidEmail = await updateNotificationPreference({
      spaceId: s.spaceId,
      emailEnabled: "false",
    });

    expect(invalidEmail.ok).toBe(false);
    if (!invalidEmail.ok) {
      expect(invalidEmail.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied userId", async () => {
    const s = await seedSpace();
    authenticateAs(s.readOnlyId);

    const read = await getNotificationPreference({
      spaceId: s.spaceId,
      userId: s.outsiderId,
    });

    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.code).toBe("VALIDATION_ERROR");
    }

    const update = await updateNotificationPreference({
      spaceId: s.spaceId,
      daysBefore: 5,
      emailEnabled: false,
      userId: s.outsiderId,
    });

    expect(update.ok).toBe(false);
    if (!update.ok) {
      expect(update.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects users who are not Members of the Space", async () => {
    const s = await seedSpace();
    authenticateAs(s.outsiderId);

    const read = await getNotificationPreference({ spaceId: s.spaceId });

    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.code).toBe("NOT_MEMBER");
    }

    const update = await updateNotificationPreference({
      spaceId: s.spaceId,
      daysBefore: 5,
      emailEnabled: false,
    });

    expect(update.ok).toBe(false);
    if (!update.ok) {
      expect(update.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("keeps preferences isolated per Space", async () => {
    const s = await seedSpace();
    const second = await createSpaceWithSystemSections(testDb, {
      name: "Work",
      ownerUserId: s.ownerId,
    });
    authenticateAs(s.ownerId);

    const updated = await updateNotificationPreference({
      spaceId: s.spaceId,
      daysBefore: 5,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error("Expected the update to succeed");
    expect(updated.data.daysBefore).toBe(5);
    expect(updated.data.userId).toBe(s.ownerId);

    const other = await getNotificationPreference({
      spaceId: second.space.id,
    });

    expect(other.ok).toBe(true);
    if (!other.ok) throw new Error("Expected the read to succeed");
    expect(other.data.userId).toBe(s.ownerId);
    expect(other.data.spaceId).toBe(second.space.id);
    expect(other.data.daysBefore).toBe(3);
    expect(other.data.emailEnabled).toBe(true);

    const home = await getNotificationPreference({ spaceId: s.spaceId });

    expect(home.ok).toBe(true);
    if (!home.ok) throw new Error("Expected the read to succeed");
    expect(home.data.daysBefore).toBe(5);
  });
});
