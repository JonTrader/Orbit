"use server";

import { z } from "zod";

import { SPACES_PATH } from "@/lib/spaces/paths";
import {
  cancelInvite as cancelInviteService,
  leaveSpace as leaveSpaceService,
  listPendingInvites as listPendingInvitesService,
  removeMember as removeMemberService,
  resendInvite as resendInviteService,
  transferOwnership as transferOwnershipService,
  updateMemberRole as updateMemberRoleService,
  type InvitePublicView,
} from "@/lib/services/members";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const spaceIdSchema = z.object({ spaceId: z.uuid() }).strict();

const inviteIdWithSpaceSchema = z
  .object({
    spaceId: z.uuid(),
    inviteId: z.uuid(),
  })
  .strict();

const memberTargetSchema = z
  .object({
    spaceId: z.uuid(),
    targetUserId: z.string().min(1),
  })
  .strict();

const updateMemberRoleSchema = memberTargetSchema
  .extend({
    role: z.enum(["read-only", "editor"]),
  })
  .strict();

export type ListPendingInvitesInput = z.input<typeof spaceIdSchema>;
export type ResendInviteInput = z.input<typeof inviteIdWithSpaceSchema>;
export type CancelInviteInput = z.input<typeof inviteIdWithSpaceSchema>;
export type UpdateMemberRoleInput = z.input<typeof updateMemberRoleSchema>;
export type RemoveMemberInput = z.input<typeof memberTargetSchema>;
export type TransferOwnershipInput = z.input<typeof memberTargetSchema>;
export type LeaveSpaceInput = z.input<typeof spaceIdSchema>;

export type ListPendingInvitesResult = ActionResult<InvitePublicView[]>;

/**
 * Owner-only pending Invite list for the ShareBar manage dialog. Skips
 * revalidation so opening the dialog does not refresh the Active Space.
 */
export const listPendingInvites = defineAction(
  spaceIdSchema,
  async (parsed, { userId, db }) =>
    listPendingInvitesService(db, {
      userId,
      spaceId: parsed.spaceId,
    }),
  { revalidate: false },
);

/** Owner-only: hard-delete a pending or expired Invite. */
export const cancelInvite = defineAction(
  inviteIdWithSpaceSchema,
  async (parsed, { userId, db }) =>
    cancelInviteService(db, {
      userId,
      inviteId: parsed.inviteId,
    }),
);

/** Owner-only: rotate the Invite secret, refresh expiry, and re-send email. */
export const resendInvite = defineAction(
  inviteIdWithSpaceSchema,
  async (parsed, { userId, db }) =>
    resendInviteService(db, {
      userId,
      inviteId: parsed.inviteId,
    }),
);

/** Owner-only: change a non-Owner Member between editor and read-only. */
export const updateMemberRole = defineAction(
  updateMemberRoleSchema,
  async (parsed, { userId, db }) =>
    updateMemberRoleService(db, {
      userId,
      spaceId: parsed.spaceId,
      targetUserId: parsed.targetUserId,
      role: parsed.role,
    }),
);

/** Owner-only: remove a non-Owner Member from the Space. */
export const removeMember = defineAction(
  memberTargetSchema,
  async (parsed, { userId, db }) =>
    removeMemberService(db, {
      userId,
      spaceId: parsed.spaceId,
      targetUserId: parsed.targetUserId,
    }),
);

/**
 * Owner-only: promote another Member to Owner and demote the caller to
 * Editor. Revalidates `/spaces` so directory roles and sidebar chrome update.
 */
export const transferOwnership = defineAction(
  memberTargetSchema,
  async (parsed, { userId, db }) =>
    transferOwnershipService(db, {
      userId,
      spaceId: parsed.spaceId,
      targetUserId: parsed.targetUserId,
    }),
  { revalidate: SPACES_PATH },
);

/**
 * Lets a non-Owner leave when another Space remains. Revalidates `/spaces`
 * so the left Space drops from the sidebar.
 */
export const leaveSpace = defineAction(
  spaceIdSchema,
  async (parsed, { userId, db }) =>
    leaveSpaceService(db, {
      userId,
      spaceId: parsed.spaceId,
    }),
  { revalidate: SPACES_PATH },
);
