import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import type { OrbitDb } from "@/lib/db/client";
import { monthly, task } from "@/lib/db/schema";

export type UpcomingTimelineKind = "monthly" | "task";

export interface UpcomingTimelineRow {
  kind: UpcomingTimelineKind;
  id: string;
  title: string;
  /** Due calendar day YYYY-MM-DD (Monthly next_due_on or Task due_on). */
  date: string;
  sectionId: string;
}

/**
 * Upcoming content in one UNION ALL: all Monthlies plus dated open Tasks.
 * No section JOIN - callers resolve Section names from layout sections.
 */
export async function fetchUpcomingTimeline(
  db: OrbitDb,
  spaceId: string,
): Promise<UpcomingTimelineRow[]> {
  const monthliesQuery = db
    .select({
      kind: sql<UpcomingTimelineKind>`'monthly'`.as("kind"),
      id: monthly.id,
      title: monthly.title,
      date: sql<string>`${monthly.nextDueOn}`.as("date"),
      sectionId: monthly.sectionId,
    })
    .from(monthly)
    .where(eq(monthly.spaceId, spaceId));

  const tasksQuery = db
    .select({
      kind: sql<UpcomingTimelineKind>`'task'`.as("kind"),
      id: task.id,
      title: task.title,
      date: sql<string>`${task.dueOn}`.as("date"),
      sectionId: task.sectionId,
    })
    .from(task)
    .where(
      and(
        eq(task.spaceId, spaceId),
        isNotNull(task.dueOn),
        isNull(task.completedAt),
      ),
    );

  return unionAll(monthliesQuery, tasksQuery).orderBy(sql`"date"`);
}
