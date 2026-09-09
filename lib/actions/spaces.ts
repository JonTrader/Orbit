"use server";

import { z } from "zod";

import { readCreatorTimeZone } from "@/lib/auth/session";
import { SPACES_PATH } from "@/lib/spaces/paths";
// Aliased: the actions below own these names in this module.
import {
  createSpace as createSpaceService,
  deleteSpace as deleteSpaceService,
  renameSpace as renameSpaceService,
} from "@/lib/services/spaces";

import { defineAction } from "./framework";

const createSpaceInputSchema = z
  .object({
    name: z.string().trim().min(1, "Space name cannot be empty"),
  })
  .strict();

const renameSpaceInputSchema = z
  .object({
    spaceId: z.uuid(),
    name: z.string().trim().min(1, "Space name cannot be empty"),
  })
  .strict();

const deleteSpaceInputSchema = z.object({ spaceId: z.uuid() }).strict();

export type CreateSpaceInput = z.input<typeof createSpaceInputSchema>;
export type RenameSpaceInput = z.input<typeof renameSpaceInputSchema>;
export type DeleteSpaceInput = z.input<typeof deleteSpaceInputSchema>;

/**
 * Creates a Space with system Sections and makes the caller its Owner.
 * Timezone comes from the auth cookie when present; the service falls back
 * to UTC. Returns the created Space so the client can navigate into it.
 */
export const createSpace = defineAction(
  createSpaceInputSchema,
  async (parsed, { userId, db }) =>
    createSpaceService(db, {
      userId,
      name: parsed.name,
      timezone: await readCreatorTimeZone(),
    }),
);

/**
 * Renames a Space. Revalidates `/spaces` so the directory sidebar and any
 * nested Active Space chrome pick up the new name.
 */
export const renameSpace = defineAction(
  renameSpaceInputSchema,
  async (parsed, { userId, db }) =>
    renameSpaceService(db, {
      userId,
      spaceId: parsed.spaceId,
      name: parsed.name,
    }),
  { revalidate: SPACES_PATH },
);

/**
 * Deletes a Space. Revalidates `/spaces` so the directory and nested Space
 * layouts drop the removed Space.
 */
export const deleteSpace = defineAction(
  deleteSpaceInputSchema,
  async (parsed, { userId, db }) =>
    deleteSpaceService(db, {
      userId,
      spaceId: parsed.spaceId,
    }),
  { revalidate: SPACES_PATH },
);
