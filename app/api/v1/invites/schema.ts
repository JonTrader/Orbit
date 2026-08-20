import { z } from "zod";

export const inviteIdParamsSchema = z
  .object({
    inviteId: z.uuid(),
  })
  .strict();

export const acceptInviteBodySchema = z
  .object({
    token: z.string().trim().min(1, "Invite token cannot be empty"),
  })
  .strict();
