import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb, OrbitExecutor } from "@/lib/db/client";
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

const DEFAULT_ACTIVITY_LIMIT = 40;
const MAX_ACTIVITY_LIMIT = 100;

/** Keyset position. `createdAt` is UTC with microsecond precision. */
export interface ActivityCursor {
  createdAt: string;
  id: string;
}

/** One Activity row plus the actor's current name. A null actor has a null name. */
export interface ActivityEntry {
  id: string;
  spaceId: string;
  actorUserId: string | null;
  actorName: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  period: string | null;
  details: ActivityDetails;
  createdAt: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  nextCursor: ActivityCursor | null;
}

export interface ListActivityInput {
  userId: string;
  spaceId: string;
  limit?: number;
  cursor?: ActivityCursor;
}

export interface ListEntityActivityInput extends ListActivityInput {
  entityType: ActivityEntityType;
  entityId: string;
}

export interface ListMonthlyCompletionsInput extends ListActivityInput {
  monthlyId: string;
}

interface ActivityQuery {
  userId: string;
  spaceId: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  action?: ActivityAction;
  limit?: number;
  cursor?: ActivityCursor;
}

/** Defaults to 40. Clamps to 1..100 so a direct caller cannot request an unbounded page. */
function clampActivityLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_ACTIVITY_LIMIT;
  const whole = Math.trunc(limit);
  if (whole < 1) return 1;
  return Math.min(whole, MAX_ACTIVITY_LIMIT);
}

/**
 * Rows strictly older than the cursor for `createdAt DESC, id DESC`.
 * Always combined with `spaceId`, so a cursor cannot cross Spaces.
 */
function olderThanCursor(cursor: ActivityCursor) {
  return sql`(${activity.createdAt}, ${activity.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`;
}

async function queryActivity(
  db: OrbitDb,
  query: ActivityQuery,
): Promise<ActivityPage> {
  await requireMembership(db, {
    userId: query.userId,
    spaceId: query.spaceId,
    minimumRole: "read-only",
  });

  const limit = clampActivityLimit(query.limit);
  const rows = await db
    .select({
      id: activity.id,
      spaceId: activity.spaceId,
      actorUserId: activity.actorUserId,
      actorName: user.name,
      entityType: activity.entityType,
      entityId: activity.entityId,
      action: activity.action,
      period: activity.period,
      details: activity.details,
      createdAt: sql<string>`to_char(${activity.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        "createdAt",
      ),
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.actorUserId))
    .where(
      and(
        eq(activity.spaceId, query.spaceId),
        query.entityType
          ? eq(activity.entityType, query.entityType)
          : undefined,
        query.entityId ? eq(activity.entityId, query.entityId) : undefined,
        query.action ? eq(activity.action, query.action) : undefined,
        query.cursor ? olderThanCursor(query.cursor) : undefined,
      ),
    )
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(limit);

  const entries: ActivityEntry[] = rows.map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    actorUserId: row.actorUserId,
    actorName: row.actorName ?? null,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    period: row.period,
    details: row.details as ActivityDetails,
    createdAt: row.createdAt,
  }));
  const last = entries[entries.length - 1];
  return {
    entries,
    nextCursor:
      entries.length === limit && last
        ? { createdAt: last.createdAt, id: last.id }
        : null,
  };
}

/** Lists a Space's Activity, newest first. Any Member, including read-only, may read it. */
export async function listActivity(
  db: OrbitDb,
  input: ListActivityInput,
): Promise<ActivityPage> {
  return queryActivity(db, input);
}

/**
 * Lists one entity's Activity in the caller's Space.
 * A foreign entity id returns an empty page and does not throw.
 */
export async function listEntityActivity(
  db: OrbitDb,
  input: ListEntityActivityInput,
): Promise<ActivityPage> {
  return queryActivity(db, {
    userId: input.userId,
    spaceId: input.spaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    limit: input.limit,
    cursor: input.cursor,
  });
}

/** Lists a Monthly's `completed` rows, newest first. */
export async function listMonthlyCompletions(
  db: OrbitDb,
  input: ListMonthlyCompletionsInput,
): Promise<ActivityPage> {
  return queryActivity(db, {
    userId: input.userId,
    spaceId: input.spaceId,
    entityType: "monthly",
    entityId: input.monthlyId,
    action: "completed",
    limit: input.limit,
    cursor: input.cursor,
  });
}
