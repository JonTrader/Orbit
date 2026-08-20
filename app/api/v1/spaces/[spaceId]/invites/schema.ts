import { z } from "zod";

export const createInviteBodySchema = z
  .object({
    email: z.string().trim().email("Invite email is invalid"),
    role: z.enum(["read-only", "editor"]).optional(),
  })
  .strict();
