import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { task } from "@/lib/db/schema";

export type FetchTasksDueOn = "any" | "dated" | "undated";
export type FetchTasksStatus = "open" | "completed" | "all";

export interface FetchTasksInput {
  spaceId: string;
  sectionId?: string;
  /** Defaults to "any": no due-date filter. */
  dueOn?: FetchTasksDueOn;
  /** Defaults to "all": open and completed Tasks. */
  status?: FetchTasksStatus;
}

/** Lists Tasks in a Space, optionally limited to one Section. No auth. */
export async function fetchTasks(
  db: OrbitDb,
  input: FetchTasksInput,
): Promise<(typeof task.$inferSelect)[]> {
  const where = and(
    input.sectionId ? eq(task.sectionId, input.sectionId) : undefined,
    eq(task.spaceId, input.spaceId),
    input.dueOn === "dated" ? isNotNull(task.dueOn) : undefined,
    input.dueOn === "undated" ? isNull(task.dueOn) : undefined,
    input.status === "open" ? isNull(task.completedAt) : undefined,
    input.status === "completed" ? isNotNull(task.completedAt) : undefined,
  );

  return db
    .select()
    .from(task)
    .where(where)
    .orderBy(asc(task.sortOrder), asc(task.createdAt), asc(task.id));
}
