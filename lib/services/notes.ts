import { and, asc, eq } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb } from "@/lib/db/client";
import { note, section, type SectionKind } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";

export type NoteSectionKind = "notes" | "mixed";
export type NoteErrorCode =
  | "INVALID_SECTION"
  | "INVALID_TITLE"
  | "INVALID_UPDATE"
  | "NOTE_NOT_FOUND";

export class NoteError extends DomainError<NoteErrorCode> {
  readonly name = "NoteError";

  constructor(code: NoteErrorCode, message: string) {
    super(code, message);
  }
}

export interface NoteAccessInput {
  userId: string;
  spaceId: string;
}

export interface ListNotesInput extends NoteAccessInput {
  sectionId?: string;
}

export interface CreateNoteInput extends NoteAccessInput {
  sectionId: string;
  /**
   * Already-resolved target Section row. Callers that just validated the
   * Section themselves (quick-add resolves it from the Space's Section list)
   * pass it here to skip a redundant re-query; it must match `sectionId`,
   * belong to the Space, and accept Notes, or the service re-validates.
   */
  section?: typeof section.$inferSelect;
  title: string;
  body?: string;
}

export interface GetNoteInput extends NoteAccessInput {
  noteId: string;
}

export interface UpdateNoteInput extends GetNoteInput {
  title?: string;
  body?: string;
}

type NoteRow = typeof note.$inferSelect;

/** Lists Notes in a Space, optionally limited to one Section. */
export async function listNotes(
  db: OrbitDb,
  input: ListNotesInput,
): Promise<NoteRow[]> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  const where = input.sectionId
    ? and(eq(note.spaceId, input.spaceId), eq(note.sectionId, input.sectionId))
    : eq(note.spaceId, input.spaceId);

  return db
    .select()
    .from(note)
    .where(where)
    .orderBy(asc(note.sortOrder), asc(note.createdAt), asc(note.id));
}

/** Gets one Note after confirming Space membership. */
export async function getNote(
  db: OrbitDb,
  input: GetNoteInput,
): Promise<NoteRow> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });
  return findNote(db, input.spaceId, input.noteId);
}

/** Creates a plain-text Note in a notes or mixed Section. */
export async function createNote(
  db: OrbitDb,
  input: CreateNoteInput,
): Promise<NoteRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const title = normalizeNoteTitle(input.title);
  const resolved = input.section;
  const targetSection =
    resolved &&
    resolved.id === input.sectionId &&
    resolved.spaceId === input.spaceId &&
    isNoteSectionKind(resolved.kind)
      ? (resolved as typeof section.$inferSelect & { kind: NoteSectionKind })
      : await findNoteSection(db, input.spaceId, input.sectionId);

  const [created] = await db
    .insert(note)
    .values({
      spaceId: input.spaceId,
      sectionId: targetSection.id,
      sectionKind: targetSection.kind,
      title,
      body: input.body ?? "",
      createdBy: input.userId,
    })
    .returning();

  return created;
}

/** Updates a Note's title or plain-text body without changing Sections. */
export async function updateNote(
  db: OrbitDb,
  input: UpdateNoteInput,
): Promise<NoteRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  await findNote(db, input.spaceId, input.noteId);

  const updates: Partial<typeof note.$inferInsert> = {};
  if (input.title !== undefined) updates.title = normalizeNoteTitle(input.title);
  if (input.body !== undefined) updates.body = input.body;

  if (Object.keys(updates).length === 0) {
    throw new NoteError("INVALID_UPDATE", "Note update has no changes");
  }

  const [updated] = await db
    .update(note)
    .set(updates)
    .where(and(eq(note.id, input.noteId), eq(note.spaceId, input.spaceId)))
    .returning();

  if (!updated) {
    throw new NoteError("NOTE_NOT_FOUND", "Note was not found");
  }

  return updated;
}

/** Deletes a Note from its current Section. */
export async function deleteNote(
  db: OrbitDb,
  input: GetNoteInput,
): Promise<NoteRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const [deleted] = await db
    .delete(note)
    .where(and(eq(note.id, input.noteId), eq(note.spaceId, input.spaceId)))
    .returning();

  if (!deleted) {
    throw new NoteError("NOTE_NOT_FOUND", "Note was not found");
  }

  return deleted;
}

async function findNote(
  db: OrbitDb,
  spaceId: string,
  noteId: string,
): Promise<NoteRow> {
  const [result] = await db
    .select()
    .from(note)
    .where(and(eq(note.id, noteId), eq(note.spaceId, spaceId)))
    .limit(1);

  if (!result) {
    throw new NoteError("NOTE_NOT_FOUND", "Note was not found");
  }

  return result;
}

async function findNoteSection(
  db: OrbitDb,
  spaceId: string,
  sectionId: string,
): Promise<typeof section.$inferSelect & { kind: NoteSectionKind }> {
  const [result] = await db
    .select()
    .from(section)
    .where(and(eq(section.id, sectionId), eq(section.spaceId, spaceId)))
    .limit(1);

  if (!result || !isNoteSectionKind(result.kind)) {
    throw new NoteError(
      "INVALID_SECTION",
      "Notes can only belong to notes or mixed Sections",
    );
  }

  return result as typeof section.$inferSelect & { kind: NoteSectionKind };
}

function isNoteSectionKind(kind: SectionKind): kind is NoteSectionKind {
  return kind === "notes" || kind === "mixed";
}

function normalizeNoteTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) {
    throw new NoteError("INVALID_TITLE", "Note title cannot be empty");
  }
  return normalized;
}
