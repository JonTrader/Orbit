import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import {
  TASK_SECTION_KINDS,
  monthly,
  notificationLog,
  space,
  spaceMember,
  task,
  user,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { reminderEmail } from "@/lib/email/templates/reminders";

import {
  addDays,
  calendarDateInTimeZone,
  formatCalendarDate,
} from "@/lib/calendar-date";
import { findPreference } from "./notification-preferences";

const DEFAULT_MONTHLY_DAYS_BEFORE = 3;

export type ReminderKind = "monthly_due" | "daily_nudge";

export interface ReminderCandidate {
  spaceId: string;
  spaceName: string;
  kind: ReminderKind;
  entityId: string;
  period: string;
  recipientUserId: string;
  recipientEmail: string;
  title: string;
  dueOn: string;
  daysBefore?: number;
}

export interface ScanReminderCandidatesInput {
  now?: Date;
}

export interface SendReminderInput {
  candidate: ReminderCandidate;
}

/**
 * Finds due Monthlies and incomplete Tasks due today or at most 3 local
 * days overdue. This scan is independent of Inngest so a scheduled runner
 * can call it later without owning domain rules.
 */
export async function scanReminderCandidates(
  db: OrbitDb,
  input: ScanReminderCandidatesInput = {},
): Promise<ReminderCandidate[]> {
  const now = input.now ?? new Date();
  const candidates: ReminderCandidate[] = [];
  const spaces = await db.select().from(space).orderBy(asc(space.id));

  for (const currentSpace of spaces) {
    const today = calendarDateInTimeZone(now, currentSpace.timezone);
    const todayString = formatCalendarDate(today);
    const monthlies = await db
      .select()
      .from(monthly)
      .where(eq(monthly.spaceId, currentSpace.id))
      .orderBy(asc(monthly.nextDueOn), asc(monthly.id));

    for (const currentMonthly of monthlies) {
      const recipient = await findRecipient(
        db,
        currentSpace.id,
        currentMonthly.assigneeId,
      );
      if (!recipient) continue;
      const preference = await findPreference(
        db,
        currentSpace.id,
        recipient.userId,
      );
      if (preference?.emailEnabled === false) continue;

      const daysBefore = preference?.daysBefore ?? DEFAULT_MONTHLY_DAYS_BEFORE;
      const reminderDate = formatCalendarDate(
        addDays(today, daysBefore),
      );
      if (currentMonthly.nextDueOn !== reminderDate) continue;

      candidates.push({
        spaceId: currentSpace.id,
        spaceName: currentSpace.name,
        kind: "monthly_due",
        entityId: currentMonthly.id,
        period: currentMonthly.nextDueOn.slice(0, 7),
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        title: currentMonthly.title,
        dueOn: currentMonthly.nextDueOn,
        daysBefore,
      });
    }

    const earliestDueOn = formatCalendarDate(addDays(today, -3));
    const dueTasks = await db
      .select()
      .from(task)
      .where(
        and(
          eq(task.spaceId, currentSpace.id),
          inArray(task.sectionKind, TASK_SECTION_KINDS),
          isNull(task.completedAt),
          gte(task.dueOn, earliestDueOn),
          lte(task.dueOn, todayString),
        ),
      )
      .orderBy(asc(task.dueOn), asc(task.sortOrder), asc(task.id));

    for (const dueTask of dueTasks) {
      if (!dueTask.dueOn) continue;
      const recipient = await findRecipient(
        db,
        currentSpace.id,
        dueTask.assigneeId,
      );
      if (!recipient) continue;
      const preference = await findPreference(
        db,
        currentSpace.id,
        recipient.userId,
      );
      if (preference?.emailEnabled === false) continue;

      candidates.push({
        spaceId: currentSpace.id,
        spaceName: currentSpace.name,
        kind: "daily_nudge",
        entityId: dueTask.id,
        period: todayString,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        title: dueTask.title,
        dueOn: dueTask.dueOn,
      });
    }
  }

  return candidates;
}

/**
 * Sends one candidate and records its idempotency key after delivery.
 * A skipped send (no Resend credentials outside production) returns null
 * and leaves `notification_log` unchanged, so a later run can still deliver.
 */
export async function sendReminder(
  db: OrbitDb,
  input: SendReminderInput,
): Promise<typeof notificationLog.$inferSelect | null> {
  const candidate = input.candidate;
  const idempotencyKey = `${candidate.kind}:${candidate.entityId}:${candidate.period}`;

  return db.transaction(async (tx) => {
    // Keep the check, delivery, and log write serialized for this candidate.
    // A hash collision only serializes unrelated candidates; it cannot cause
    // an incorrect log match because the database key is checked below.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${idempotencyKey})::bigint)`,
    );

    const [existing] = await tx
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) return existing;

    const email = reminderEmail(candidate);
    const delivery = await sendEmail(email, { idempotencyKey });
    if (delivery === "skipped") return null;

    const [logged] = await tx
      .insert(notificationLog)
      .values({
        spaceId: candidate.spaceId,
        kind: candidate.kind,
        entityId: candidate.entityId,
        period: candidate.period,
        recipientUserId: candidate.recipientUserId,
        recipientEmail: candidate.recipientEmail,
        idempotencyKey,
      })
      .onConflictDoNothing({ target: notificationLog.idempotencyKey })
      .returning();

    if (logged) return logged;

    const [raceWinner] = await tx
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.idempotencyKey, idempotencyKey))
      .limit(1);
    return raceWinner ?? null;
  });
}

/** Scans and sends all candidates, returning the writes made or found. */
export async function sendReminderCandidates(
  db: OrbitDb,
  input: ScanReminderCandidatesInput = {},
): Promise<(typeof notificationLog.$inferSelect)[]> {
  const candidates = await scanReminderCandidates(db, input);
  const sent: (typeof notificationLog.$inferSelect)[] = [];
  for (const candidate of candidates) {
    const logged = await sendReminder(db, { candidate });
    if (logged) sent.push(logged);
  }
  return sent;
}

async function findRecipient(
  db: OrbitDb,
  spaceId: string,
  assigneeId: string | null,
): Promise<{ userId: string; email: string } | null> {
  if (assigneeId) {
    const [assignee] = await db
      .select({ userId: user.id, email: user.email })
      .from(spaceMember)
      .innerJoin(user, eq(user.id, spaceMember.userId))
      .where(
        and(
          eq(spaceMember.spaceId, spaceId),
          eq(spaceMember.userId, assigneeId),
        ),
      )
      .limit(1);
    if (assignee) return assignee;
  }

  const [owner] = await db
    .select({ userId: user.id, email: user.email })
    .from(spaceMember)
    .innerJoin(user, eq(user.id, spaceMember.userId))
    .where(
      and(eq(spaceMember.spaceId, spaceId), eq(spaceMember.role, "owner")),
    )
    .limit(1);
  return owner ?? null;
}
