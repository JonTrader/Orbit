"use server";

import { z } from "zod";

import type { invite } from "@/lib/db/schema";
import { inviteMember } from "@/lib/services/members";

import { defineAction } from "./define-action";
import type { ActionResult } from "./result";

const sendInviteInputSchema = z
  .object({
    spaceId: z.uuid(),
    email: z.string().trim().email("Invite email is invalid"),
    /** Defaults to read-only, matching the Invite rules in the spec. */
    role: z.enum(["read-only", "editor"]).optional(),
  })
  .strict();

export type SendInviteInput = z.input<typeof sendInviteInputSchema>;

export type SendInviteResult = ActionResult<typeof invite.$inferSelect>;

/**
 * Creates an Invite for the Active Space from the share bar. Owner-only by
 * the underlying service; the default role is read-only and the Invite
 * expires after seven days. The invite email delivery itself lands with the
 * Phase H template work.
 */
export const sendInvite = defineAction(
  sendInviteInputSchema,
  async (parsed, { userId, db }) =>
    inviteMember(db, {
      userId,
      spaceId: parsed.spaceId,
      email: parsed.email,
      role: parsed.role,
    }),
);
