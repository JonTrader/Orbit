"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_PATH } from "@/lib/auth-paths";
import type { invite } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { inviteMember } from "@/lib/services/members";
import { requireVerifiedSession } from "@/lib/session";

import { toActionError, type ActionResult } from "./result";

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
export async function sendInvite(
  input: unknown,
): Promise<SendInviteResult> {
  // Awaited outside try so its redirect for unauthenticated or unverified
  // callers propagates instead of turning into an action error.
  const session = await requireVerifiedSession();

  try {
    const parsed = sendInviteInputSchema.parse(input);
    const created = await inviteMember(getDb(), {
      userId: session.user.id,
      spaceId: parsed.spaceId,
      email: parsed.email,
      role: parsed.role,
    });

    revalidatePath(APP_PATH);
    return { ok: true, data: created };
  } catch (error) {
    return toActionError(error);
  }
}
