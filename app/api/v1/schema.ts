import { z } from "zod";

export const spaceIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();
