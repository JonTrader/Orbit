"use server";

import { z } from "zod";

import {
  listActivity as listActivityService,
  listEntityActivity as listEntityActivityService,
  type ActivityPage,
} from "@/lib/services/activity";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const cursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

const listActivityInputSchema = z
  .object({
    spaceId: z.uuid(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: cursorSchema.optional(),
  })
  .strict();

const listEntityActivityInputSchema = z
  .object({
    spaceId: z.uuid(),
    entityType: z.enum(["task", "monthly", "note", "section"]),
    entityId: z.uuid(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: cursorSchema.optional(),
  })
  .strict();

export type ListActivityInput = z.input<typeof listActivityInputSchema>;
export type ListEntityActivityInput = z.input<
  typeof listEntityActivityInputSchema
>;

export type ListActivityResult = ActionResult<ActivityPage>;
export type ListEntityActivityResult = ActionResult<ActivityPage>;

/**
 * Space Activity feed. Skips revalidation so opening the dialog does not
 * refresh the Active Space.
 */
export const listActivity = defineAction(
  listActivityInputSchema,
  async (parsed, { userId, db }) =>
    listActivityService(db, {
      userId,
      spaceId: parsed.spaceId,
      limit: parsed.limit,
      cursor: parsed.cursor,
    }),
  { revalidate: false },
);

/**
 * One entity's History. Skips revalidation so opening the dialog does not
 * refresh the Active Space.
 */
export const listEntityActivity = defineAction(
  listEntityActivityInputSchema,
  async (parsed, { userId, db }) =>
    listEntityActivityService(db, {
      userId,
      spaceId: parsed.spaceId,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      limit: parsed.limit,
      cursor: parsed.cursor,
    }),
  { revalidate: false },
);
