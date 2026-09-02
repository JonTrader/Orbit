import { and, asc, eq } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { note } from "@/lib/db/schema";

export interface FetchNotesInput {
  spaceId: string;
  sectionId?: string;
}

/** Lists Notes in a Space, optionally limited to one Section. No auth. */
export async function fetchNotes(
  db: OrbitDb,
  input: FetchNotesInput,
): Promise<(typeof note.$inferSelect)[]> {
  const where = input.sectionId
    ? and(eq(note.spaceId, input.spaceId), eq(note.sectionId, input.sectionId))
    : eq(note.spaceId, input.spaceId);

  return db
    .select()
    .from(note)
    .where(where)
    .orderBy(asc(note.sortOrder), asc(note.createdAt), asc(note.id));
}
