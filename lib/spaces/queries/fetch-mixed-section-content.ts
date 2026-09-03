import { sql } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { note, task } from "@/lib/db/schema";

export interface MixedSectionContent {
  tasks: (typeof task.$inferSelect)[];
  notes: (typeof note.$inferSelect)[];
}

type TaskJson = {
  id: string;
  spaceId: string;
  sectionId: string;
  sectionKind: (typeof task.$inferSelect)["sectionKind"];
  title: string;
  dueOn: string | null;
  assigneeId: string | null;
  completedAt: string | Date | null;
  completedBy: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type NoteJson = {
  id: string;
  spaceId: string;
  sectionId: string;
  sectionKind: (typeof note.$inferSelect)["sectionKind"];
  title: string;
  body: string;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function asNullableDate(value: string | Date | null): Date | null {
  if (value == null) return null;
  return asDate(value);
}

function parseTasks(value: unknown): (typeof task.$inferSelect)[] {
  const rows = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (JSON.parse(value) as unknown)
      : null;
  if (!Array.isArray(rows)) return [];
  return (rows as TaskJson[]).map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    sectionId: row.sectionId,
    sectionKind: row.sectionKind,
    title: row.title,
    dueOn: row.dueOn,
    assigneeId: row.assigneeId,
    completedAt: asNullableDate(row.completedAt),
    completedBy: row.completedBy,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy,
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  }));
}

function parseNotes(value: unknown): (typeof note.$inferSelect)[] {
  const rows = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (JSON.parse(value) as unknown)
      : null;
  if (!Array.isArray(rows)) return [];
  return (rows as NoteJson[]).map((row) => ({
    id: row.id,
    spaceId: row.spaceId,
    sectionId: row.sectionId,
    sectionKind: row.sectionKind,
    title: row.title,
    body: row.body,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy,
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
  }));
}

/**
 * Mixed Section content in one SELECT: Tasks and Notes via two json_agg
 * subqueries (different row shapes - no UNION ALL). No auth.
 */
export async function fetchMixedSectionContent(
  db: OrbitDb,
  input: { spaceId: string; sectionId: string },
): Promise<MixedSectionContent> {
  const { spaceId, sectionId } = input;

  const [row] = await db
    .select({
      tasks: sql<TaskJson[]>`(
        select coalesce(
          json_agg(
            json_build_object(
              'id', ${task.id},
              'spaceId', ${task.spaceId},
              'sectionId', ${task.sectionId},
              'sectionKind', ${task.sectionKind},
              'title', ${task.title},
              'dueOn', ${task.dueOn},
              'assigneeId', ${task.assigneeId},
              'completedAt', ${task.completedAt},
              'completedBy', ${task.completedBy},
              'sortOrder', ${task.sortOrder},
              'createdBy', ${task.createdBy},
              'createdAt', ${task.createdAt},
              'updatedAt', ${task.updatedAt}
            )
            order by ${task.sortOrder}, ${task.createdAt}, ${task.id}
          ),
          '[]'::json
        )
        from ${task}
        where ${task.spaceId} = ${spaceId}
          and ${task.sectionId} = ${sectionId}
      )`,
      notes: sql<NoteJson[]>`(
        select coalesce(
          json_agg(
            json_build_object(
              'id', ${note.id},
              'spaceId', ${note.spaceId},
              'sectionId', ${note.sectionId},
              'sectionKind', ${note.sectionKind},
              'title', ${note.title},
              'body', ${note.body},
              'sortOrder', ${note.sortOrder},
              'createdBy', ${note.createdBy},
              'createdAt', ${note.createdAt},
              'updatedAt', ${note.updatedAt}
            )
            order by ${note.sortOrder}, ${note.createdAt}, ${note.id}
          ),
          '[]'::json
        )
        from ${note}
        where ${note.spaceId} = ${spaceId}
          and ${note.sectionId} = ${sectionId}
      )`,
    })
    .from(sql`(select 1) as _`);

  return {
    tasks: parseTasks(row?.tasks),
    notes: parseNotes(row?.notes),
  };
}
