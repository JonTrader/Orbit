import { asc, eq } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { monthly } from "@/lib/db/schema";

/** Lists Monthlies in due-date order for a Space. No auth. */
export async function fetchMonthlies(
  db: OrbitDb,
  spaceId: string,
): Promise<(typeof monthly.$inferSelect)[]> {
  return db
    .select()
    .from(monthly)
    .where(eq(monthly.spaceId, spaceId))
    .orderBy(asc(monthly.nextDueOn), asc(monthly.sortOrder), asc(monthly.id));
}
