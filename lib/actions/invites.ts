"use server";

import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";

import { spaceSectionPath, SPACES_PATH } from "@/lib/spaces/paths";
import {
  acceptInvite as acceptInviteMember,
  inviteMember,
  type InvitePublicView,
} from "@/lib/services/members";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const sendInviteInputSchema = z
  .object({
    spaceId: z.uuid(),
    email: z.string().trim().email("Invite email is invalid"),
    /** Defaults to read-only, matching the Invite rules in the spec. */
    role: z.enum(["read-only", "editor"]).optional(),
  })
  .strict();

const acceptInviteInputSchema = z
  .object({
    token: z.string().min(1).max(256),
  })
  .strict();

export type SendInviteInput = z.input<typeof sendInviteInputSchema>;
export type AcceptInviteInput = z.input<typeof acceptInviteInputSchema>;

export type SendInviteResult = ActionResult<InvitePublicView>;
export type AcceptInviteResult = ActionResult<
  Awaited<ReturnType<typeof acceptInviteMember>>
>;

/**
 * Creates an Invite for the Active Space from the share bar and emails the
 * accept link. Owner-only by the underlying service; the default role is
 * read-only and the Invite expires after seven days.
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

const runAcceptInvite = defineAction(
  acceptInviteInputSchema,
  async (parsed, { userId, db }) =>
    acceptInviteMember(db, {
      userId,
      token: parsed.token,
    }),
  { revalidate: SPACES_PATH },
);

/**
 * Accepts a pending Invite for the verified session user. Revalidates the
 * Space directory, then `redirect()`s to Upcoming with the write result's
 * spaceId so `/accept-invite` is never re-rendered with a consumed token.
 */
export async function acceptInvite(
  input: unknown,
): Promise<AcceptInviteResult> {
  const result = await runAcceptInvite(input);
  if (result.ok) {
    redirect(
      spaceSectionPath(result.data.spaceId, "upcoming"),
      RedirectType.replace,
    );
  }
  return result;
}
