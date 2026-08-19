import { z } from "zod";

export const spaceIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const createSpaceBodySchema = z
  .object({
    name: z.string().trim().min(1, "Space name cannot be empty"),
    timezone: z.string().trim().min(1).optional(),
  })
  .strict();

export const updateSpaceBodySchema = z
  .object({
    timezone: z.string().trim().min(1),
  })
  .strict();
