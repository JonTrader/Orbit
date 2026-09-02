import { asc, desc, eq } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { section } from "@/lib/db/schema";

/** Lists all Sections for a Space with system Sections fixed at the top. No auth. */
export async function fetchSections(
  db: OrbitDb,
  spaceId: string,
): Promise<(typeof section.$inferSelect)[]> {
  return db
    .select()
    .from(section)
    .where(eq(section.spaceId, spaceId))
    .orderBy(desc(section.isSystem), asc(section.sortOrder), asc(section.id));
}
