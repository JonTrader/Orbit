import { beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";
import {
  getNotificationPreference,
  updateNotificationPreference,
} from "@/lib/services/notification-preferences";

import { testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Notification preference services", () => {
  beforeEach(() => truncateAll());

  async function seedSpace() {
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

    return { owner, readOnly, outsider, ...seeded };
  }

  it("creates documented defaults for Members on first read", async () => {
    const { readOnly, space } = await seedSpace();

    await expect(
      getNotificationPreference(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
      }),
    ).resolves.toMatchObject({
      userId: readOnly.id,
      spaceId: space.id,
      daysBefore: 3,
      emailEnabled: true,
    });
  });

  it("allows read-only Members to update their own preference", async () => {
    const { readOnly, space } = await seedSpace();

    const created = await getNotificationPreference(testDb, {
      userId: readOnly.id,
      spaceId: space.id,
    });

    await expect(
      updateNotificationPreference(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        daysBefore: 7,
        emailEnabled: false,
      }),
    ).resolves.toMatchObject({
      id: created.id,
      daysBefore: 7,
      emailEnabled: false,
    });
  });

  it("creates defaults on first update when no preference row exists", async () => {
    const { readOnly, space } = await seedSpace();

    await expect(
      updateNotificationPreference(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        daysBefore: 5,
        emailEnabled: false,
      }),
    ).resolves.toMatchObject({
      userId: readOnly.id,
      spaceId: space.id,
      daysBefore: 5,
      emailEnabled: false,
    });
  });

  it("keeps preferences isolated per Space for the same user", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const work = await createSpaceWithSystemSections(testDb, {
      name: "Work",
      ownerUserId: owner.id,
    });

    await updateNotificationPreference(testDb, {
      userId: owner.id,
      spaceId: home.space.id,
      daysBefore: 5,
      emailEnabled: false,
    });

    await expect(
      getNotificationPreference(testDb, {
        userId: owner.id,
        spaceId: home.space.id,
      }),
    ).resolves.toMatchObject({
      daysBefore: 5,
      emailEnabled: false,
    });
    await expect(
      getNotificationPreference(testDb, {
        userId: owner.id,
        spaceId: work.space.id,
      }),
    ).resolves.toMatchObject({
      daysBefore: 3,
      emailEnabled: true,
    });
  });

  it("rejects non-member reads and updates", async () => {
    const { outsider, space } = await seedSpace();

    await expect(
      getNotificationPreference(testDb, {
        userId: outsider.id,
        spaceId: space.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });

    await expect(
      updateNotificationPreference(testDb, {
        userId: outsider.id,
        spaceId: space.id,
        emailEnabled: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
  });

  it("rejects empty and invalid preference updates", async () => {
    const { readOnly, space } = await seedSpace();

    await expect(
      updateNotificationPreference(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_UPDATE" });

    for (const daysBefore of [-1, 31, 1.5]) {
      await expect(
        updateNotificationPreference(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          daysBefore,
        }),
      ).rejects.toMatchObject({ code: "INVALID_DAYS_BEFORE" });
    }
  });
});
