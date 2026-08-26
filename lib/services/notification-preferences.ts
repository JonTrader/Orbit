import { and, eq } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb } from "@/lib/db/client";
import { notificationPreference } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";

export type NotificationPreferenceErrorCode =
  | "INVALID_DAYS_BEFORE"
  | "INVALID_UPDATE"
  | "NOTIFICATION_PREFERENCE_NOT_FOUND";

export class NotificationPreferenceError extends DomainError<NotificationPreferenceErrorCode> {
  readonly name = "NotificationPreferenceError";

  constructor(code: NotificationPreferenceErrorCode, message: string) {
    super(code, message);
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

/**
 * Updates only the caller's notification preference for this Space.
 *
 * Read-only Members may mutate their own preferences because the setting is
 * per-user and does not change shared Space content or membership.
 */
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

export async function findPreference(
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
