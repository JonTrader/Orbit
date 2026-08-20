import { z } from "zod";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";

export const memberUserParamsSchema = spaceIdParamsSchema.extend({
  userId: z.string().min(1),
});

export const updateMemberRoleBodySchema = z
  .object({
    role: z.enum(["read-only", "editor"]),
  })
  .strict();
