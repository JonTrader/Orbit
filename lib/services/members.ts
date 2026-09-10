import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb } from "@/lib/db/client";
import { invite, space, spaceMember, user, type SpaceRole } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";
import {
  buildInviteAcceptUrl,
} from "@/lib/email/templates/invite";
import { sendInviteEmail } from "@/lib/email/templates/invite-emails";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const PENDING_INVITE_CONSTRAINT = "invite_space_email_pending_unique";

type InviteRole = Exclude<SpaceRole, "owner">;

export type MemberErrorCode =
  | "ALREADY_MEMBER"
  | "EMAIL_MISMATCH"
  | "EXPIRED_INVITE"
  | "INVALID_EMAIL"
  | "INVALID_ROLE"
  | "INVITE_ALREADY_PENDING"
  | "INVITE_EMAIL_FAILED"
  | "INVITE_NOT_FOUND"
  | "LAST_SPACE"
  | "MEMBER_NOT_FOUND"
  | "OWNER_CANNOT_LEAVE"
  | "OWNERSHIP_TRANSFER_REQUIRED";

export class MemberError extends DomainError<MemberErrorCode> {
  readonly name = "MemberError";

  constructor(code: MemberErrorCode, message: string) {
    super(code, message);
  }
}

export interface InviteMemberInput {
  userId: string;
  spaceId: string;
  email: string;
  role?: InviteRole;
}

export interface InviteAccessInput {
  userId: string;
  inviteId: string;
}

export interface AcceptInviteInput {
  userId: string;
  token: string;
}

export interface MemberAccessInput {
  userId: string;
  spaceId: string;
}

export interface MemberTargetInput extends MemberAccessInput {
  targetUserId: string;
}

export interface UpdateMemberRoleInput extends MemberTargetInput {
  role: InviteRole;
}

export interface SpaceMemberView {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Invite fields safe to return from create/list/resend (digest omitted). */
export type InvitePublicView = Omit<typeof invite.$inferSelect, "tokenDigest">;

/** SHA-256 hex digest of a raw Invite bearer secret. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Creates an Owner-authorized Invite and emails the accept link. */
export async function inviteMember(
  db: OrbitDb,
  input: InviteMemberInput,
): Promise<InvitePublicView> {
  await requireMembership(db, { ...input, minimumRole: "owner" });
  const email = normalizeEmail(input.email);
  const role = validateInviteRole(input.role ?? "read-only");

  const [context] = await db
    .select({
      spaceName: space.name,
      memberId: spaceMember.id,
    })
    .from(space)
    .leftJoin(user, sql`lower(${user.email}) = ${email}`)
    .leftJoin(
      spaceMember,
      and(
        eq(spaceMember.spaceId, space.id),
        eq(spaceMember.userId, user.id),
      ),
    )
    .where(eq(space.id, input.spaceId))
    .limit(1);

  if (!context) {
    throw new MemberError("INVITE_NOT_FOUND", "Space was not found");
  }
  if (context.memberId) {
    throw new MemberError(
      "ALREADY_MEMBER",
      "That user is already a Member of this Space",
    );
  }

  const secret = createInviteSecret();
  let created: typeof invite.$inferSelect;
  try {
    const [row] = await db
      .insert(invite)
      .values({
        spaceId: input.spaceId,
        email,
        role,
        tokenDigest: secret.digest,
        invitedBy: input.userId,
        expiresAt: inviteExpiry(),
      })
      .returning();
    created = row;
  } catch (error) {
    if (isUniqueViolation(error, PENDING_INVITE_CONSTRAINT)) {
      throw new MemberError(
        "INVITE_ALREADY_PENDING",
        "An Invite is already pending for that email in this Space",
      );
    }
    throw error;
  }

  await deliverInviteEmail({
    to: email,
    spaceName: context.spaceName,
    role,
    rawToken: secret.raw,
    expiresAt: created.expiresAt,
    idempotencyKey: inviteEmailIdempotencyKey(created.id, secret.digest),
  });

  return withoutInviteDigest(created);
}

/** Refreshes expiry, rotates the secret, and re-sends the accept email. */
export async function resendInvite(
  db: OrbitDb,
  input: InviteAccessInput,
): Promise<InvitePublicView> {
  await requireMembership(db, {
    userId: input.userId,
    spaceId: await findInviteSpaceId(db, input.inviteId),
    minimumRole: "owner",
  });

  const [current] = await db
    .select({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      acceptedAt: invite.acceptedAt,
      spaceName: space.name,
    })
    .from(invite)
    .innerJoin(space, eq(space.id, invite.spaceId))
    .where(eq(invite.id, input.inviteId))
    .limit(1);
  if (!current || current.acceptedAt) {
    throw new MemberError("INVITE_NOT_FOUND", "Pending Invite was not found");
  }

  const secret = createInviteSecret();
  const [updated] = await db
    .update(invite)
    .set({
      expiresAt: inviteExpiry(),
      tokenDigest: secret.digest,
    })
    .where(and(eq(invite.id, input.inviteId), isNull(invite.acceptedAt)))
    .returning();

  if (!updated) {
    throw new MemberError("INVITE_NOT_FOUND", "Pending Invite was not found");
  }

  await deliverInviteEmail({
    to: current.email,
    spaceName: current.spaceName,
    role: validateInviteRole(current.role),
    rawToken: secret.raw,
    expiresAt: updated.expiresAt,
    idempotencyKey: inviteEmailIdempotencyKey(updated.id, secret.digest),
  });

  return withoutInviteDigest(updated);
}

/** Accepts a pending Invite for a signed-in user whose email matches it. */
export async function acceptInvite(
  db: OrbitDb,
  input: AcceptInviteInput,
): Promise<typeof spaceMember.$inferSelect> {
  const tokenDigest = hashInviteToken(input.token);

  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(invite)
      .where(eq(invite.tokenDigest, tokenDigest))
      .for("update")
      .limit(1);

    if (!pending || pending.acceptedAt) {
      throw new MemberError("INVITE_NOT_FOUND", "Invite was not found");
    }
    if (pending.expiresAt.getTime() <= Date.now()) {
      throw new MemberError("EXPIRED_INVITE", "Invite has expired");
    }

    const [recipient] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    if (!recipient || normalizeEmail(recipient.email) !== pending.email) {
      throw new MemberError(
        "EMAIL_MISMATCH",
        "Invite email does not match the signed-in user",
      );
    }

    const [existingMembership] = await tx
      .select({ id: spaceMember.id })
      .from(spaceMember)
      .where(
        and(
          eq(spaceMember.spaceId, pending.spaceId),
          eq(spaceMember.userId, input.userId),
        ),
      )
      .limit(1);
    if (existingMembership) {
      throw new MemberError(
        "ALREADY_MEMBER",
        "User is already a Member of this Space",
      );
    }

    await tx
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.id, pending.id));

    const [created] = await tx
      .insert(spaceMember)
      .values({
        spaceId: pending.spaceId,
        userId: input.userId,
        role: pending.role,
      })
      .returning();

    return created;
  });
}

/** Lists pending Invites for a Space; Owner-only. */
export async function listPendingInvites(
  db: OrbitDb,
  input: MemberAccessInput,
): Promise<InvitePublicView[]> {
  await requireMembership(db, { ...input, minimumRole: "owner" });

  const rows = await db
    .select()
    .from(invite)
    .where(and(eq(invite.spaceId, input.spaceId), isNull(invite.acceptedAt)))
    .orderBy(asc(invite.createdAt), asc(invite.id));

  return rows.map(withoutInviteDigest);
}

/** Lists Members with the user fields needed by the share surface. */
export async function listMembers(
  db: OrbitDb,
  input: MemberAccessInput,
): Promise<SpaceMemberView[]> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  return db
    .select({
      id: spaceMember.id,
      spaceId: spaceMember.spaceId,
      userId: spaceMember.userId,
      role: spaceMember.role,
      name: user.name,
      email: user.email,
      image: user.image,
      createdAt: spaceMember.createdAt,
      updatedAt: spaceMember.updatedAt,
    })
    .from(spaceMember)
    .innerJoin(user, eq(user.id, spaceMember.userId))
    .where(eq(spaceMember.spaceId, input.spaceId))
    .orderBy(asc(spaceMember.createdAt), asc(spaceMember.id));
}

/** Changes a non-Owner Member's role. Ownership uses transferOwnership. */
export async function updateMemberRole(
  db: OrbitDb,
  input: UpdateMemberRoleInput,
): Promise<typeof spaceMember.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "owner" });
  const role = validateInviteRole(input.role);
  const current = await findMember(db, input.spaceId, input.targetUserId);

  if (current.role === "owner") {
    throw new MemberError(
      "OWNERSHIP_TRANSFER_REQUIRED",
      "Ownership must be changed with transferOwnership",
    );
  }

  const [updated] = await db
    .update(spaceMember)
    .set({ role })
    .where(eq(spaceMember.id, current.id))
    .returning();

  if (!updated) {
    throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
  }

  return updated;
}

/** Removes a non-Owner Member from a Space. */
export async function removeMember(
  db: OrbitDb,
  input: MemberTargetInput,
): Promise<typeof spaceMember.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "owner" });
  const current = await findMember(db, input.spaceId, input.targetUserId);

  if (current.role === "owner") {
    throw new MemberError(
      "OWNERSHIP_TRANSFER_REQUIRED",
      "The Owner must transfer ownership before leaving",
    );
  }

  const [removed] = await db
    .delete(spaceMember)
    .where(eq(spaceMember.id, current.id))
    .returning();

  if (!removed) {
    throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
  }

  return removed;
}

/** Transfers ownership and demotes the former Owner to Editor atomically. */
export async function transferOwnership(
  db: OrbitDb,
  input: MemberTargetInput,
): Promise<{ formerOwner: typeof spaceMember.$inferSelect; owner: typeof spaceMember.$inferSelect }> {
  if (input.userId === input.targetUserId) {
    throw new MemberError(
      "MEMBER_NOT_FOUND",
      "Ownership must be transferred to another Member",
    );
  }
  await requireMembership(db, { ...input, minimumRole: "owner" });

  return db.transaction(async (tx) => {
    const members = await tx
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, input.spaceId))
      .for("update");
    const formerOwner = members.find(
      (member) => member.userId === input.userId && member.role === "owner",
    );
    const target = members.find(
      (member) => member.userId === input.targetUserId,
    );

    if (!formerOwner) {
      throw new MemberError("OWNERSHIP_TRANSFER_REQUIRED", "Caller is not the Owner");
    }
    if (!target) {
      throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
    }

    const [demoted] = await tx
      .update(spaceMember)
      .set({ role: "editor" })
      .where(eq(spaceMember.id, formerOwner.id))
      .returning();
    const [promoted] = await tx
      .update(spaceMember)
      .set({ role: "owner" })
      .where(eq(spaceMember.id, target.id))
      .returning();

    if (!demoted || !promoted) {
      throw new MemberError(
        "OWNERSHIP_TRANSFER_REQUIRED",
        "Ownership transfer did not complete",
      );
    }

    return { formerOwner: demoted, owner: promoted };
  });
}

/**
 * Lets a non-Owner leave when another Space remains. An Owner must transfer
 * ownership before leaving a Space with other Members; an empty Space must be
 * deleted instead. No Member may leave their last remaining Space.
 */
export async function leaveSpace(
  db: OrbitDb,
  input: MemberAccessInput,
): Promise<typeof spaceMember.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  return db.transaction(async (tx) => {
    const memberships = await tx
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.userId, input.userId))
      .for("update");
    const current = memberships.find(
      (member) => member.spaceId === input.spaceId,
    );

    if (!current) {
      throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
    }
    if (memberships.length <= 1) {
      throw new MemberError(
        "LAST_SPACE",
        "A user cannot leave their last remaining Space",
      );
    }
    if (current.role === "owner") {
      const otherMembers = await tx
        .select({ id: spaceMember.id })
        .from(spaceMember)
        .where(
          and(
            eq(spaceMember.spaceId, input.spaceId),
            sql`${spaceMember.userId} <> ${input.userId}`,
          ),
        )
        .for("update");
      if (otherMembers.length > 0) {
        throw new MemberError(
          "OWNERSHIP_TRANSFER_REQUIRED",
          "The Owner must transfer ownership before leaving",
        );
      }
      throw new MemberError(
        "OWNER_CANNOT_LEAVE",
        "An Owner cannot leave an empty Space; delete it instead",
      );
    }

    const [removed] = await tx
      .delete(spaceMember)
      .where(eq(spaceMember.id, current.id))
      .returning();

    if (!removed) {
      throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
    }

    return removed;
  });
}

async function deliverInviteEmail(input: {
  to: string;
  spaceName: string;
  role: InviteRole;
  rawToken: string;
  expiresAt: Date;
  idempotencyKey: string;
}): Promise<void> {
  try {
    await sendInviteEmail(
      input.to,
      {
        spaceName: input.spaceName,
        role: input.role,
        acceptUrl: buildInviteAcceptUrl(input.rawToken),
        expiresAt: input.expiresAt,
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch {
    throw new MemberError(
      "INVITE_EMAIL_FAILED",
      "Invite was saved but the email could not be sent. Resend to try again.",
    );
  }
}

function inviteEmailIdempotencyKey(inviteId: string, tokenDigest: string): string {
  return `invite:${inviteId}:${tokenDigest}`;
}

function createInviteSecret(): { raw: string; digest: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, digest: hashInviteToken(raw) };
}

async function findMember(
  db: OrbitDb,
  spaceId: string,
  userId: string,
): Promise<typeof spaceMember.$inferSelect> {
  const [member] = await db
    .select()
    .from(spaceMember)
    .where(
      and(eq(spaceMember.spaceId, spaceId), eq(spaceMember.userId, userId)),
    )
    .limit(1);

  if (!member) {
    throw new MemberError("MEMBER_NOT_FOUND", "Member was not found");
  }

  return member;
}

async function findInviteSpaceId(db: OrbitDb, inviteId: string): Promise<string> {
  const [result] = await db
    .select({ spaceId: invite.spaceId })
    .from(invite)
    .where(eq(invite.id, inviteId))
    .limit(1);

  if (!result) {
    throw new MemberError("INVITE_NOT_FOUND", "Invite was not found");
  }

  return result.spaceId;
}

function withoutInviteDigest(
  row: typeof invite.$inferSelect,
): InvitePublicView {
  const { tokenDigest: _digest, ...view } = row;
  return view;
}

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_LIFETIME_MS);
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new MemberError("INVALID_EMAIL", "Invite email is invalid");
  }
  return normalized;
}

function validateInviteRole(role: SpaceRole): InviteRole {
  if (role !== "read-only" && role !== "editor") {
    throw new MemberError(
      "INVALID_ROLE",
      "Invites and Member role changes cannot create an Owner",
    );
  }
  return role;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const record = current as {
      code?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (record.code === "23505" && record.constraint === constraint) {
      return true;
    }
    current = record.cause;
  }
  return false;
}
