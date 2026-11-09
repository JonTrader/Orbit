import { inArray } from "drizzle-orm";

import type { OrbitExecutor } from "@/lib/db/client";
import {
  activity,
  user,
  type ActivityAction,
  type ActivityEntityType,
} from "@/lib/db/schema";

/** JSON value stored in an Activity field change. */
export type ActivityChangeValue = string | number | boolean | null;

export interface ActivityFieldChange {
  from: ActivityChangeValue;
  to: ActivityChangeValue;
  /** Snapshotted display name. Used when Assignee leaves the Space. */
  fromName?: string;
  toName?: string;
}

/**
 * Snapshot stored in `activity.details`. Optional keys are omitted when a
 * write does not use them. There is no database check constraint.
 */
export interface ActivityDetails {
  title: string;
  changes?: Record<string, ActivityFieldChange>;
  fromSectionId?: string;
  toSectionId?: string;
  fromSectionName?: string;
  toSectionName?: string;
  dueDayOfMonth?: number;
  previousNextDueOn?: string;
  nextDueOn?: string;
  previousLastCompletedAt?: string | null;
  previousLastCompletedBy?: string | null;
  /** Set on rows written because a Section was deleted. */
  cause?: "section_deleted";
  /** Name of the Section that caused a cascade delete. */
  sectionName?: string;
}

export interface RecordActivityInput {
  spaceId: string;
  actorUserId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  /** Calendar date (`YYYY-MM-DD`). Set only for Monthly completion. */
  period?: string | null;
  details: ActivityDetails;
}

/**
 * Inserts one Activity row on the caller's client. Does not check membership
 * and does not open a transaction; the caller already did both.
 */
export async function recordActivity(
  executor: OrbitExecutor,
  input: RecordActivityInput,
): Promise<void> {
  await executor.insert(activity).values({
    spaceId: input.spaceId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    period: input.period ?? null,
    details: input.details,
  });
}

/** Snapshots Assignee names from `user`. Clearing omits `toName`. */
export async function assigneeActivityChange(
  executor: OrbitExecutor,
  fromId: string | null,
  toId: string | null,
): Promise<ActivityFieldChange> {
  const ids = [fromId, toId].filter((id): id is string => id != null);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await executor
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, ids));
    for (const row of rows) names.set(row.id, row.name);
  }

  const change: ActivityFieldChange = { from: fromId, to: toId };
  const fromName = fromId == null ? undefined : names.get(fromId);
  const toName = toId == null ? undefined : names.get(toId);
  if (fromName !== undefined) change.fromName = fromName;
  if (toName !== undefined) change.toName = toName;
  return change;
}
