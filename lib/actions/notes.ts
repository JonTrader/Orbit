"use server";

import { z } from "zod";

import type { note } from "@/lib/db/schema";
import { updateNote as updateNoteService } from "@/lib/services/notes";

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

export type UpdateNoteInput = z.input<typeof updateNoteInputSchema>;
export type UpdateNoteResult = ActionResult<typeof note.$inferSelect>;

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
