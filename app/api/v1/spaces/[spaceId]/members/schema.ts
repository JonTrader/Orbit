import { z } from "zod";

export const memberSpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const memberUserParamsSchema = z
  .object({
    spaceId: z.uuid(),
    userId: z.string().min(1),
  })
  .strict();

export const updateMemberRoleBodySchema = z
  .object({
    role: z.enum(["read-only", "editor"]),
  })
  .strict();
