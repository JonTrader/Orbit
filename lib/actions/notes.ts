"use server";

import { z } from "zod";

import type { note } from "@/lib/db/schema";
import {
  deleteNote as deleteNoteService,
  updateNote as updateNoteService,
} from "@/lib/services/notes";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const updateNoteInputSchema = z
  .object({
    spaceId: z.uuid(),
    noteId: z.uuid(),
    title: z.string().trim().min(1, "Note title cannot be empty").optional(),
    body: z.string().optional(),
  })
  .strict()
  .refine(
    (input) => input.title !== undefined || input.body !== undefined,
    "Note update must include a title or body",
  );

const deleteNoteInputSchema = z
  .object({
    spaceId: z.uuid(),
    noteId: z.uuid(),
  })
  .strict();

export type UpdateNoteInput = z.input<typeof updateNoteInputSchema>;
export type UpdateNoteResult = ActionResult<typeof note.$inferSelect>;
export type DeleteNoteInput = z.input<typeof deleteNoteInputSchema>;
export type DeleteNoteResult = ActionResult<typeof note.$inferSelect>;

/**
 * Updates a Note's title or plain-text body. Read-only Members cannot edit
 * Notes; the owning domain service enforces that via requireMembership.
 */
export const updateNote = defineAction(
  updateNoteInputSchema,
  async (parsed, { userId, db }) =>
    updateNoteService(db, {
      userId,
      spaceId: parsed.spaceId,
      noteId: parsed.noteId,
      title: parsed.title,
      body: parsed.body,
    }),
);

/**
 * Permanently deletes a Note from its current Section. Read-only Members
 * cannot delete Notes; the owning domain service enforces that via
 * requireMembership.
 */
export const deleteNote = defineAction(
  deleteNoteInputSchema,
  async (parsed, { userId, db }) =>
    deleteNoteService(db, {
      userId,
      spaceId: parsed.spaceId,
      noteId: parsed.noteId,
    }),
);
