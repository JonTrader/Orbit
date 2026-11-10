import { and, desc, eq } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import { fetchSections } from "@/lib/spaces/queries/fetch-sections";
import type { OrbitDb, OrbitExecutor } from "@/lib/db/client";
import {
  note,
  section,
  task,
  type ActivityAction,
  type SectionKind,
} from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";
import {
  recordActivity,
  type ActivityDetails,
} from "@/lib/services/activity";

export type CustomSectionKind = "tasks" | "notes" | "mixed";
export type SectionErrorCode =
  | "INVALID_KIND"
  | "INVALID_NAME"
  | "INVALID_REORDER"
  | "SECTION_NOT_FOUND"
  | "SYSTEM_SECTION";

export class SectionError extends DomainError<SectionErrorCode> {
  readonly name = "SectionError";

  constructor(code: SectionErrorCode, message: string) {
    super(code, message);
  }
}

export interface SectionAccessInput {
  userId: string;
  spaceId: string;
}

export interface CreateCustomSectionInput extends SectionAccessInput {
  name: string;
  kind: CustomSectionKind;
}

export interface RenameSectionInput extends SectionAccessInput {
  sectionId: string;
  name: string;
}

export interface ReorderCustomSectionsInput extends SectionAccessInput {
  /** The complete custom Section order, excluding system Sections. */
  sectionIds: string[];
}

export interface DeleteSectionInput extends SectionAccessInput {
  sectionId: string;
}

export interface GetSectionForMemberInput extends SectionAccessInput {
  sectionId: string;
}

type SectionRow = typeof section.$inferSelect;

/** Lists all Sections for a Member, with system Sections fixed at the top. */
export async function listSections(
  db: OrbitDb,
  input: SectionAccessInput,
): Promise<SectionRow[]> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });
  return fetchSections(db, input.spaceId);
}

/** Fetches one Section row for a Member after the membership gate. */
export async function getSectionForMember(
  db: OrbitDb,
  input: GetSectionForMemberInput,
): Promise<SectionRow> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });
  return findSection(db, input.spaceId, input.sectionId);
}

/** Creates a custom Section after the existing system and custom Sections. */
export async function createCustomSection(
  db: OrbitDb,
  input: CreateCustomSectionInput,
): Promise<SectionRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const name = normalizeSectionName(input.name);
  assertCustomSectionKind(input.kind);

  return db.transaction(async (tx) => {
    const [lastCustom] = await tx
      .select({ sortOrder: section.sortOrder })
      .from(section)
      .where(
        and(eq(section.spaceId, input.spaceId), eq(section.isSystem, false)),
      )
      .orderBy(desc(section.sortOrder))
      .limit(1);

    const [created] = await tx
      .insert(section)
      .values({
        spaceId: input.spaceId,
        name,
        kind: input.kind,
        isSystem: false,
        sortOrder: Math.max(lastCustom?.sortOrder ?? 1, 1) + 1,
      })
      .returning();

    await recordSectionActivity(tx, input, created.id, "created", {
      title: created.name,
    });
    return created;
  });
}

/** Renames a custom Section. System Section names are fixed. */
export async function renameSection(
  db: OrbitDb,
  input: RenameSectionInput,
): Promise<SectionRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const name = normalizeSectionName(input.name);
  const current = await findSection(db, input.spaceId, input.sectionId);
  assertCustomSection(current);

  return db.transaction(async (tx) => {
    const latest = await findSection(tx, input.spaceId, input.sectionId);
    assertCustomSection(latest);

    const [updated] = await tx
      .update(section)
      .set({ name })
      .where(
        and(eq(section.id, input.sectionId), eq(section.spaceId, input.spaceId)),
      )
      .returning();

    if (!updated) {
      throw new SectionError("SECTION_NOT_FOUND", "Section was not found");
    }

    if (updated.name !== latest.name) {
      await recordSectionActivity(tx, input, updated.id, "updated", {
        title: updated.name,
        changes: { name: { from: latest.name, to: updated.name } },
      });
    }

    return updated;
  });
}

/**
 * Reorders all custom Sections as one complete list. System Sections cannot be
 * included and remain at the top of the navigation.
 */
export async function reorderCustomSections(
  db: OrbitDb,
  input: ReorderCustomSectionsInput,
): Promise<SectionRow[]> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  assertUniqueSectionIds(input.sectionIds);

  const allSpaceRows = await db
    .select({ id: section.id, isSystem: section.isSystem })
    .from(section)
    .where(eq(section.spaceId, input.spaceId));
  const requestedIds = new Set(input.sectionIds);
  const customRows = allSpaceRows.filter((row) => !row.isSystem);
  const systemRequested = allSpaceRows.some(
    (row) => row.isSystem && requestedIds.has(row.id),
  );

  if (systemRequested) {
    throw new SectionError(
      "SYSTEM_SECTION",
      "System Sections cannot be reordered with custom Sections",
    );
  }

  if (
    customRows.length !== input.sectionIds.length ||
    customRows.some((row) => !requestedIds.has(row.id))
  ) {
    throw new SectionError(
      "INVALID_REORDER",
      "Reorder must include every custom Section exactly once",
    );
  }

  await db.transaction(async (tx) => {
    for (const [index, sectionId] of input.sectionIds.entries()) {
      await tx
        .update(section)
        .set({ sortOrder: index + 2 })
        .where(
          and(eq(section.id, sectionId), eq(section.spaceId, input.spaceId)),
        );
    }
  });

  return listSections(db, input);
}

/**
 * Deletes a custom Section. Child Tasks and Notes are removed by the database
 * cascade after this transaction records `deleted` Activity for each of them
 * and for the Section. Do not call `deleteTask` or `deleteNote` here.
 */
export async function deleteCustomSection(
  db: OrbitDb,
  input: DeleteSectionInput,
): Promise<SectionRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const existing = await findSection(db, input.spaceId, input.sectionId);
  assertCustomSection(existing);

  return db.transaction(async (tx) => {
    const current = await findSection(tx, input.spaceId, input.sectionId);
    assertCustomSection(current);

    const childTasks = await tx
      .select({ id: task.id, title: task.title })
      .from(task)
      .where(
        and(eq(task.sectionId, current.id), eq(task.spaceId, input.spaceId)),
      );
    const childNotes = await tx
      .select({ id: note.id, title: note.title })
      .from(note)
      .where(
        and(eq(note.sectionId, current.id), eq(note.spaceId, input.spaceId)),
      );

    for (const child of childTasks) {
      await recordActivity(tx, {
        spaceId: input.spaceId,
        actorUserId: input.userId,
        entityType: "task",
        entityId: child.id,
        action: "deleted",
        details: {
          title: child.title,
          cause: "section_deleted",
          sectionName: current.name,
        },
      });
    }
    for (const child of childNotes) {
      await recordActivity(tx, {
        spaceId: input.spaceId,
        actorUserId: input.userId,
        entityType: "note",
        entityId: child.id,
        action: "deleted",
        details: {
          title: child.title,
          cause: "section_deleted",
          sectionName: current.name,
        },
      });
    }

    await recordSectionActivity(tx, input, current.id, "deleted", {
      title: current.name,
    });

    const [deleted] = await tx
      .delete(section)
      .where(
        and(eq(section.id, current.id), eq(section.spaceId, input.spaceId)),
      )
      .returning();

    if (!deleted) {
      throw new SectionError("SECTION_NOT_FOUND", "Section was not found");
    }

    return deleted;
  });
}

async function findSection(
  db: OrbitExecutor,
  spaceId: string,
  sectionId: string,
): Promise<SectionRow> {
  const [result] = await db
    .select()
    .from(section)
    .where(and(eq(section.id, sectionId), eq(section.spaceId, spaceId)))
    .limit(1);

  if (!result) {
    throw new SectionError("SECTION_NOT_FOUND", "Section was not found");
  }

  return result;
}

function assertCustomSection(sectionRow: SectionRow): void {
  if (sectionRow.isSystem) {
    throw new SectionError(
      "SYSTEM_SECTION",
      "System Sections cannot be renamed or deleted",
    );
  }
}

function assertCustomSectionKind(kind: SectionKind): asserts kind is CustomSectionKind {
  if (kind === "daily" || kind === "monthlies") {
    throw new SectionError(
      "INVALID_KIND",
      "Only custom Section kinds may be created",
    );
  }
}

function assertUniqueSectionIds(sectionIds: string[]): void {
  if (new Set(sectionIds).size !== sectionIds.length) {
    throw new SectionError(
      "INVALID_REORDER",
      "A Section cannot appear more than once in a reorder request",
    );
  }
}

function normalizeSectionName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new SectionError("INVALID_NAME", "Section name cannot be empty");
  }
  return normalized;
}

async function recordSectionActivity(
  executor: OrbitExecutor,
  input: { userId: string; spaceId: string },
  sectionId: string,
  action: ActivityAction,
  details: ActivityDetails,
): Promise<void> {
  await recordActivity(executor, {
    spaceId: input.spaceId,
    actorUserId: input.userId,
    entityType: "section",
    entityId: sectionId,
    action,
    details,
  });
}
