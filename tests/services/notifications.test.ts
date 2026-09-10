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
  section,
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
    const [customTasks] = await testDb
      .insert(section)
      .values({
        spaceId: seeded.space.id,
        name: "Errands",
        kind: "tasks",
        sortOrder: 2,
      })
      .returning();
    // Default N=3: only nextDueOn === today+3 is included; N-1 / N+1 are not.
    await testDb.insert(monthly).values([
      {
        spaceId: seeded.space.id,
        sectionId: seeded.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Rent",
        dueDayOfMonth: 13,
        nextDueOn: "2026-08-13",
      },
      {
        spaceId: seeded.space.id,
        sectionId: seeded.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Too soon (N-1)",
        dueDayOfMonth: 12,
        nextDueOn: "2026-08-12",
      },
      {
        spaceId: seeded.space.id,
        sectionId: seeded.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Too late (N+1)",
        dueDayOfMonth: 14,
        nextDueOn: "2026-08-14",
      },
    ]);
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
        title: "Due today",
        dueOn: "2026-08-10",
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
      {
        spaceId: seeded.space.id,
        sectionId: customTasks.id,
        sectionKind: "tasks",
        title: "Custom dated Task",
        dueOn: "2026-08-10",
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
        expect.objectContaining({
          kind: "daily_nudge",
          title: "Due today",
          recipientUserId: owner.id,
          recipientEmail: owner.email,
          period: "2026-08-10",
          dueOn: "2026-08-10",
        }),
      ]),
    );
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.title)).not.toContain("Too soon (N-1)");
    expect(candidates.map((c) => c.title)).not.toContain("Too late (N+1)");
    expect(candidates.map((c) => c.title)).not.toContain("Custom dated Task");
    expect(
      candidates.filter((c) => c.kind === "daily_nudge").map((c) => c.title),
    ).toEqual(expect.arrayContaining(["Overdue task", "Due today"]));
  });

  it("sends to the Assignee and uses that user's monthly preference", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const assignee = await createUser({ email: "assignee@orbit.test" });
    const formerAssignee = await createUser({ email: "former@orbit.test" });
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
    await testDb.insert(notificationPreference).values([
      {
        spaceId: seeded.space.id,
        userId: owner.id,
        emailEnabled: false,
      },
      {
        spaceId: seeded.space.id,
        userId: assignee.id,
        daysBefore: 5,
        emailEnabled: true,
      },
    ]);
    const [assigned] = await testDb
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
    const [orphaned] = await testDb
      .insert(monthly)
      .values({
        spaceId: seeded.space.id,
        sectionId: seeded.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Former Assignee Monthly",
        dueDayOfMonth: 13,
        nextDueOn: "2026-08-13",
        assigneeId: formerAssignee.id,
      })
      .returning();

    const candidates = await scanReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    // Owner opted out; Assignee still receives their own Monthly Reminder.
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: assigned.id,
          kind: "monthly_due",
          recipientUserId: assignee.id,
          recipientEmail: assignee.email,
          daysBefore: 5,
        }),
      ]),
    );
    // Former Assignee is not a Member, so recipient falls back to Owner -
    // but Owner opted out, so that candidate is suppressed.
    expect(candidates.map((c) => c.entityId)).not.toContain(orphaned.id);
    expect(candidates).toHaveLength(1);

    await testDb
      .update(notificationPreference)
      .set({ emailEnabled: true })
      .where(eq(notificationPreference.userId, owner.id));

    const afterOwnerOptIn = await scanReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(afterOwnerOptIn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: assigned.id,
          recipientUserId: assignee.id,
        }),
        expect.objectContaining({
          entityId: orphaned.id,
          kind: "monthly_due",
          title: "Former Assignee Monthly",
          recipientUserId: owner.id,
          recipientEmail: owner.email,
          daysBefore: 3,
        }),
      ]),
    );
    expect(afterOwnerOptIn).toHaveLength(2);
  });

  it("isolates monthly Reminder prefs across Spaces for the same user", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    const work = await createSpaceWithSystemSections(testDb, {
      name: "Work",
      timezone: "UTC",
      ownerUserId: owner.id,
    });
    await testDb.insert(notificationPreference).values([
      {
        spaceId: home.space.id,
        userId: owner.id,
        daysBefore: 5,
      },
      {
        spaceId: work.space.id,
        userId: owner.id,
        daysBefore: 3,
      },
    ]);
    await testDb.insert(monthly).values([
      {
        spaceId: home.space.id,
        sectionId: home.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Home rent",
        dueDayOfMonth: 15,
        nextDueOn: "2026-08-15",
      },
      {
        spaceId: work.space.id,
        sectionId: work.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Work dues",
        dueDayOfMonth: 13,
        nextDueOn: "2026-08-13",
      },
      {
        spaceId: work.space.id,
        sectionId: work.sections.monthlies.id,
        sectionKind: "monthlies",
        title: "Work ignored at N=5",
        dueDayOfMonth: 15,
        nextDueOn: "2026-08-15",
      },
    ]);

    const candidates = await scanReminderCandidates(testDb, {
      now: new Date("2026-08-10T12:00:00Z"),
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: home.space.id,
          title: "Home rent",
          daysBefore: 5,
        }),
        expect.objectContaining({
          spaceId: work.space.id,
          title: "Work dues",
          daysBefore: 3,
        }),
      ]),
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.title)).not.toContain("Work ignored at N=5");
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
