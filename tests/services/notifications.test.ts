import { vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email/mailer", () => ({ sendEmail }));

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import {
  monthly,
  notificationLog,
  notificationPreference,
  spaceMember,
  task,
} from "@/lib/db/schema";
import {
  scanReminderCandidates,
  sendReminder,
  sendReminderCandidates,
} from "@/lib/services/notifications";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Reminder notification service", () => {
  beforeAll(migrateTestDb);
  beforeEach(() => {
    return truncateAll().then(() => {
      sendEmail.mockReset();
      sendEmail.mockResolvedValue(undefined);
    });
  });

  it("scans default monthly candidates and due or overdue Daily Tasks", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    await testDb.insert(monthly).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.monthlies.id,
      sectionKind: "monthlies",
      title: "Rent",
      dueDayOfMonth: 13,
      nextDueOn: "2026-08-13",
    });
    await testDb.insert(task).values([
      {
        spaceId: seeded.space.id,
        sectionId: seeded.sections.daily.id,
        sectionKind: "daily",
        title: "Overdue task",
        dueOn: "2026-08-09",
      },
      {
        spaceId: seeded.space.id,
        sectionId: seeded.sections.daily.id,
        sectionKind: "daily",
        title: "Completed task",
        dueOn: "2026-08-09",
        completedAt: new Date("2026-08-09T12:00:00Z"),
        completedBy: owner.id,
      },
    ]);

    const candidates = await scanReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "monthly_due",
          title: "Rent",
          recipientUserId: owner.id,
          recipientEmail: owner.email,
          period: "2026-08",
          daysBefore: 3,
        }),
        expect.objectContaining({
          kind: "daily_nudge",
          title: "Overdue task",
          recipientUserId: owner.id,
          recipientEmail: owner.email,
          period: "2026-08-10",
        }),
      ]),
    );
    expect(candidates).toHaveLength(2);
  });

  it("sends to the Assignee and uses that user's monthly preference", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const assignee = await createUser({ email: "assignee@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: assignee.id,
      role: "read-only",
    });
    await testDb.insert(notificationPreference).values({
      spaceId: seeded.space.id,
      userId: assignee.id,
      daysBefore: 5,
    });
    const [row] = await testDb
      .insert(monthly)
      .values({
        spaceId: seeded.space.id,
        sectionId: seeded.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Insurance",
        dueDayOfMonth: 15,
        nextDueOn: "2026-08-15",
        assigneeId: assignee.id,
      })
      .returning();

    const candidates = await scanReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        entityId: row.id,
        kind: "monthly_due",
        recipientUserId: assignee.id,
        recipientEmail: assignee.email,
        daysBefore: 5,
      }),
    ]);
  });

  it("uses the Space timezone when finding monthly and daily candidates", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "West Coast",
      timezone: "America/Los_Angeles",
      ownerUserId: owner.id,
    });
    await testDb.insert(monthly).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.monthlies.id,
      sectionKind: "monthlies",
      title: "Due after local midnight",
      dueDayOfMonth: 15,
      nextDueOn: "2026-08-15",
    });
    await testDb.insert(task).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.daily.id,
      sectionKind: "daily",
      title: "Local overdue",
      dueOn: "2026-08-11",
    });

    const candidates = await scanReminderCandidates(testDb, {
      // This is Aug 12 in America/Los_Angeles, not Aug 13.
      now: new Date("2026-08-13T06:00:00Z"),
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "monthly_due",
          dueOn: "2026-08-15",
        }),
        expect.objectContaining({
          kind: "daily_nudge",
          period: "2026-08-12",
        }),
      ]),
    );
  });

  it("respects a recipient's per-Space email opt-out", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    await testDb.insert(notificationPreference).values({
      spaceId: seeded.space.id,
      userId: owner.id,
      emailEnabled: false,
    });
    await testDb.insert(monthly).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.monthlies.id,
      sectionKind: "monthlies",
      title: "Opted out Monthly",
      dueDayOfMonth: 13,
      nextDueOn: "2026-08-13",
    });
    await testDb.insert(task).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.daily.id,
      sectionKind: "daily",
      title: "Opted out Task",
      dueOn: "2026-08-09",
    });

    await expect(
      scanReminderCandidates(testDb, {
        now: new Date("2026-08-10T12:00:00Z"),
      }),
    ).resolves.toEqual([]);
  });

  it("sends once and the notification log prevents a retry duplicate", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const candidate = {
      spaceId: seeded.space.id,
      kind: "daily_nudge" as const,
      entityId: "00000000-0000-0000-0000-000000000001",
      period: "2026-08-10",
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      title: "Take out <recycling>",
      dueOn: "2026-08-09",
    };

    const first = await sendReminder(testDb, { candidate });
    const second = await sendReminder(testDb, { candidate });

    expect(first?.id).toBeDefined();
    expect(second?.id).toBe(first?.id);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: owner.email,
        subject: "Orbit Reminder: Take out <recycling> is due",
        html: expect.stringContaining("&lt;recycling&gt;"),
      }),
      { idempotencyKey: "daily_nudge:00000000-0000-0000-0000-000000000001:2026-08-10" },
    );
    await expect(
      testDb
        .select()
        .from(notificationLog)
        .where(eq(notificationLog.id, first!.id)),
    ).resolves.toHaveLength(1);
  });

  it("serializes concurrent sends for one candidate", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const candidate = {
      spaceId: seeded.space.id,
      kind: "daily_nudge" as const,
      entityId: "00000000-0000-0000-0000-000000000002",
      period: "2026-08-10",
      recipientUserId: owner.id,
      recipientEmail: owner.email,
      title: "Concurrent task",
      dueOn: "2026-08-10",
    };
    let releaseEmail!: () => void;
    let markEmailStarted!: () => void;
    const emailStarted = new Promise<void>((resolve) => {
      markEmailStarted = resolve;
    });
    const allowEmail = new Promise<void>((resolve) => {
      releaseEmail = resolve;
    });
    sendEmail.mockImplementationOnce(async () => {
      markEmailStarted();
      await allowEmail;
    });

    const first = sendReminder(testDb, { candidate });
    await emailStarted;
    const second = sendReminder(testDb, { candidate });
    releaseEmail();

    const [firstLog, secondLog] = await Promise.all([first, second]);

    expect(firstLog?.id).toBeDefined();
    expect(secondLog?.id).toBe(firstLog?.id);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("scans, sends, and logs candidates through the callable batch service", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    await testDb.insert(task).values({
      spaceId: seeded.space.id,
      sectionId: seeded.sections.daily.id,
      sectionKind: "daily",
      title: "Batch task",
      dueOn: "2026-08-10",
    });

    const sent = await sendReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(sent).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
