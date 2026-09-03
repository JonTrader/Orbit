"use server";

import { z } from "zod";

import { readCreatorTimeZone } from "@/lib/auth/session";
// Aliased: the action below owns the name `createSpace` in this module.
import { createSpace as createSpaceService } from "@/lib/services/spaces";

import { defineAction } from "./framework";

const createSpaceInputSchema = z
  .object({
    name: z.string().trim().min(1, "Space name cannot be empty"),
  })
  .strict();

export type CreateSpaceInput = z.input<typeof createSpaceInputSchema>;

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
