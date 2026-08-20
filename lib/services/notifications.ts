import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/authz/require-membership";
import {
  calendarDateInTimeZone,
  formatCalendarDate,
  type CalendarDate,
} from "@/lib/calendar-date";
import type { OrbitDb } from "@/lib/db/client";
import {
  monthly,
  notificationLog,
  notificationPreference,
  space,
  spaceMember,
  task,
  user,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";

const DEFAULT_MONTHLY_DAYS_BEFORE = 3;

export type ReminderKind = "monthly_due" | "daily_nudge";

export interface ReminderCandidate {
  spaceId: string;
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

export type NotificationPreferenceErrorCode =
  | "INVALID_DAYS_BEFORE"
  | "INVALID_UPDATE"
  | "NOTIFICATION_PREFERENCE_NOT_FOUND";

export class NotificationPreferenceError extends Error {
  readonly name = "NotificationPreferenceError";

  constructor(
    readonly code: NotificationPreferenceErrorCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface NotificationPreferenceAccessInput {
  userId: string;
  spaceId: string;
}

export interface UpdateNotificationPreferenceInput
  extends NotificationPreferenceAccessInput {
  daysBefore?: number;
  emailEnabled?: boolean;
}

/** Returns the caller's per-Space preference, creating the documented defaults when absent. */
export async function getNotificationPreference(
  db: OrbitDb,
  input: NotificationPreferenceAccessInput,
): Promise<typeof notificationPreference.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  const existing = await findPreference(db, input.spaceId, input.userId);
  if (existing) return existing;

  const [created] = await db
    .insert(notificationPreference)
    .values({ userId: input.userId, spaceId: input.spaceId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const concurrent = await findPreference(db, input.spaceId, input.userId);
  if (concurrent) return concurrent;

  throw new NotificationPreferenceError(
    "NOTIFICATION_PREFERENCE_NOT_FOUND",
    "Notification preference was not found",
  );
}

/** Updates only the caller's notification preference for this Space. */
export async function updateNotificationPreference(
  db: OrbitDb,
  input: UpdateNotificationPreferenceInput,
): Promise<typeof notificationPreference.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  if (input.daysBefore === undefined && input.emailEnabled === undefined) {
    throw new NotificationPreferenceError(
      "INVALID_UPDATE",
      "Notification preference update has no changes",
    );
  }
  if (
    input.daysBefore !== undefined &&
    (!Number.isInteger(input.daysBefore) || input.daysBefore < 0 || input.daysBefore > 30)
  ) {
    throw new NotificationPreferenceError(
      "INVALID_DAYS_BEFORE",
      "Reminder days before must be an integer from 0 through 30",
    );
  }

  const current = await getNotificationPreference(db, input);
  const updates: Partial<typeof notificationPreference.$inferInsert> = {};
  if (input.daysBefore !== undefined) updates.daysBefore = input.daysBefore;
  if (input.emailEnabled !== undefined) updates.emailEnabled = input.emailEnabled;

  const [updated] = await db
    .update(notificationPreference)
    .set(updates)
    .where(
      and(
        eq(notificationPreference.id, current.id),
        eq(notificationPreference.userId, input.userId),
        eq(notificationPreference.spaceId, input.spaceId),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotificationPreferenceError(
      "NOTIFICATION_PREFERENCE_NOT_FOUND",
      "Notification preference was not found",
    );
  }

  return updated;
}

/**
 * Finds due Monthlies and overdue or due Daily Tasks. This scan is independent
 * of Inngest so a scheduled runner can call it later without owning domain
 * rules.
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

    const dailyTasks = await db
      .select()
      .from(task)
      .where(
        and(
          eq(task.spaceId, currentSpace.id),
          eq(task.sectionKind, "daily"),
          isNull(task.completedAt),
          lte(task.dueOn, todayString),
        ),
      )
      .orderBy(asc(task.dueOn), asc(task.sortOrder), asc(task.id));

    for (const dailyTask of dailyTasks) {
      if (!dailyTask.dueOn) continue;
      const recipient = await findRecipient(
        db,
        currentSpace.id,
        dailyTask.assigneeId,
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
        kind: "daily_nudge",
        entityId: dailyTask.id,
        period: todayString,
        recipientUserId: recipient.userId,
        recipientEmail: recipient.email,
        title: dailyTask.title,
        dueOn: dailyTask.dueOn,
      });
    }
  }

  return candidates;
}

/** Sends one candidate and records its idempotency key after delivery. */
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
    await sendEmail(email, { idempotencyKey });

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

async function findPreference(
  db: OrbitDb,
  spaceId: string,
  userId: string,
): Promise<typeof notificationPreference.$inferSelect | undefined> {
  const [preference] = await db
    .select()
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.spaceId, spaceId),
        eq(notificationPreference.userId, userId),
      ),
    )
    .limit(1);
  return preference;
}

function reminderEmail(candidate: ReminderCandidate): {
  to: string;
  subject: string;
  html: string;
  text: string;
} {
  const subject =
    candidate.kind === "monthly_due"
      ? `Orbit Reminder: ${candidate.title} is due ${candidate.dueOn}`
      : `Orbit Reminder: ${candidate.title} is due`;
  const text = `${candidate.title} is due on ${candidate.dueOn}.`;
  const html = `<p>${escapeHtml(candidate.title)} is due on ${escapeHtml(candidate.dueOn)}.</p>`;
  return { to: candidate.recipientEmail, subject, html, text };
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}
