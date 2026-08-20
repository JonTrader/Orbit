import { z } from "zod";

export const inviteSpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const createInviteBodySchema = z
  .object({
    email: z.string().trim().email("Invite email is invalid"),
    role: z.enum(["read-only", "editor"]).optional(),
  })
  .strict();
