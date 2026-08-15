import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import {
  invite,
  monthly,
  notificationLog,
  notificationPreference,
} from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("invite", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("stores role and expiry, defaulting to read-only", async () => {
    const owner = await createUser();
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    const [row] = await testDb
      .insert(invite)
      .values({
        spaceId: space.id,
        email: "partner@orbit.test",
        token: randomUUID(),
        invitedBy: owner.id,
        expiresAt,
      })
      .returning();

    expect(row.role).toBe("read-only");
    expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(row.acceptedAt).toBeNull();
  });

  it("accepts an editor invite but never an owner invite", async () => {
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
    });
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    const [editorInvite] = await testDb
      .insert(invite)
      .values({
        spaceId: space.id,
        email: "editor@orbit.test",
        role: "editor",
        token: randomUUID(),
        expiresAt,
      })
      .returning();
    expect(editorInvite.role).toBe("editor");

    await expect(
      testDb.insert(invite).values({
        spaceId: space.id,
        email: "usurper@orbit.test",
        role: "owner",
        token: randomUUID(),
        expiresAt,
      }),
    ).rejects.toThrow();
  });

  it("allows only one pending Invite per email per Space", async () => {
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
    });
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);
    const values = {
      spaceId: space.id,
      email: "partner@orbit.test",
      expiresAt,
    };

    const [first] = await testDb
      .insert(invite)
      .values({ ...values, token: randomUUID() })
      .returning();

    await expect(
      testDb.insert(invite).values({ ...values, token: randomUUID() }),
    ).rejects.toThrow();

    // Once accepted, the Space can invite that email again.
    await testDb
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.id, first.id));

    await expect(
      testDb.insert(invite).values({ ...values, token: randomUUID() }),
    ).resolves.toBeDefined();
  });
});

describe("notification_preference", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("defaults to 3 days before with email on", async () => {
    const member = await createUser();
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: member.id,
    });

    const [row] = await testDb
      .insert(notificationPreference)
      .values({ userId: member.id, spaceId: space.id })
      .returning();

    expect(row.daysBefore).toBe(3);
    expect(row.emailEnabled).toBe(true);
  });

  it("is unique per user per Space", async () => {
    const member = await createUser();
    const homeSpace = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: member.id,
    });
    const personalSpace = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
    });

    await testDb
      .insert(notificationPreference)
      .values({ userId: member.id, spaceId: homeSpace.space.id });

    await expect(
      testDb
        .insert(notificationPreference)
        .values({
          userId: member.id,
          spaceId: homeSpace.space.id,
          daysBefore: 1,
        }),
    ).rejects.toThrow();

    // The same user keeps a separate preference in another Space.
    await expect(
      testDb.insert(notificationPreference).values({
        userId: member.id,
        spaceId: personalSpace.space.id,
        emailEnabled: false,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects days_before outside the 0-30 range", async () => {
    const member = await createUser();
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: member.id,
    });

    for (const daysBefore of [-1, 31]) {
      await expect(
        testDb.insert(notificationPreference).values({
          userId: member.id,
          spaceId: space.id,
          daysBefore,
        }),
      ).rejects.toThrow();
    }
  });
});

describe("monthly", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("rejects due_day_of_month outside the 1-31 range", async () => {
    const owner = await createUser();
    const { space, sections } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    for (const dueDayOfMonth of [0, 32]) {
      await expect(
        testDb.insert(monthly).values({
          spaceId: space.id,
          sectionId: sections.monthlies.id,
          sectionKind: "monthlies",
          title: "Rent",
          dueDayOfMonth,
          nextDueOn: "2026-09-01",
        }),
      ).rejects.toThrow();
    }
  });
});

describe("notification_log", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("rejects a duplicate idempotency key so a retry cannot double-send", async () => {
    const recipient = await createUser();
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: recipient.id,
    });

    const entityId = randomUUID();
    const entry = {
      spaceId: space.id,
      kind: "monthly_due" as const,
      entityId,
      period: "2026-09",
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      idempotencyKey: `monthly_due:${entityId}:2026-09`,
    };

    const [row] = await testDb.insert(notificationLog).values(entry).returning();
    expect(row.sentAt).toBeInstanceOf(Date);

    await expect(
      testDb.insert(notificationLog).values(entry),
    ).rejects.toThrow();

    // A different period for the same Monthly is a new send.
    await expect(
      testDb.insert(notificationLog).values({
        ...entry,
        period: "2026-10",
        idempotencyKey: `monthly_due:${entityId}:2026-10`,
      }),
    ).resolves.toBeDefined();
  });
});
