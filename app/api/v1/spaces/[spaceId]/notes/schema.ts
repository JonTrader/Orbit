import { z } from "zod";

export const noteSpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const noteIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
    noteId: z.uuid(),
  })
  .strict();

export const listNotesQuerySchema = z
  .object({
    sectionId: z.uuid().optional(),
  })
  .strict();

export const createNoteBodySchema = z
  .object({
    sectionId: z.uuid(),
    title: z.string().trim().min(1, "Note title cannot be empty"),
    body: z.string().optional(),
  })
  .strict();

export const updateNoteBodySchema = z
  .object({
    title: z.string().trim().min(1, "Note title cannot be empty").optional(),
    body: z.string().optional(),
  })
  .strict();
