import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import type { OrbitDb } from "@/lib/db/client";
import { invite, spaceMember, user, type SpaceRole } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

type InviteRole = Exclude<SpaceRole, "owner">;

export type MemberErrorCode =
  | "ALREADY_MEMBER"
  | "EMAIL_MISMATCH"
  | "EXPIRED_INVITE"
  | "INVALID_EMAIL"
  | "INVALID_ROLE"
  | "INVITE_ALREADY_PENDING"
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

/** Creates an Owner-authorized Invite without sending email yet. */
export async function inviteMember(
  db: OrbitDb,
  input: InviteMemberInput,
): Promise<typeof invite.$inferSelect> {
  await requireMembership(db, { ...input, minimumRole: "owner" });
  const email = normalizeEmail(input.email);
  const role = validateInviteRole(input.role ?? "read-only");

  const [existingPending] = await db
    .select({ id: invite.id })
    .from(invite)
    .where(
      and(
        eq(invite.spaceId, input.spaceId),
        eq(invite.email, email),
        isNull(invite.acceptedAt),
      ),
    )
    .limit(1);
  if (existingPending) {
    throw new MemberError(
      "INVITE_ALREADY_PENDING",
      "An Invite is already pending for that email in this Space",
    );
  }

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  if (existingUser) {
    const [existingMembership] = await db
      .select({ id: spaceMember.id })
      .from(spaceMember)
      .where(
        and(
          eq(spaceMember.spaceId, input.spaceId),
          eq(spaceMember.userId, existingUser.id),
        ),
      )
      .limit(1);
    if (existingMembership) {
      throw new MemberError(
        "ALREADY_MEMBER",
        "That user is already a Member of this Space",
      );
    }
  }

  const [created] = await db
    .insert(invite)
    .values({
      spaceId: input.spaceId,
      email,
      role,
      token: randomUUID(),
      invitedBy: input.userId,
      expiresAt: inviteExpiry(),
    })
    .returning();

  return created;
}

/** Refreshes a pending Invite to another seven-day window. */
export async function resendInvite(
  db: OrbitDb,
  input: InviteAccessInput,
): Promise<typeof invite.$inferSelect> {
  await requireMembership(db, {
    userId: input.userId,
    spaceId: await findInviteSpaceId(db, input.inviteId),
    minimumRole: "owner",
  });

  const [current] = await db
    .select()
    .from(invite)
    .where(eq(invite.id, input.inviteId))
    .limit(1);
  if (!current || current.acceptedAt) {
    throw new MemberError("INVITE_NOT_FOUND", "Pending Invite was not found");
  }

  const [updated] = await db
    .update(invite)
    .set({ expiresAt: inviteExpiry() })
    .where(and(eq(invite.id, input.inviteId), isNull(invite.acceptedAt)))
    .returning();

  if (!updated) {
    throw new MemberError("INVITE_NOT_FOUND", "Pending Invite was not found");
  }

  return updated;
}

/** Accepts a pending Invite for a signed-in user whose email matches it. */
export async function acceptInvite(
  db: OrbitDb,
  input: AcceptInviteInput,
): Promise<typeof spaceMember.$inferSelect> {
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(invite)
      .where(eq(invite.token, input.token))
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
): Promise<(typeof invite.$inferSelect)[]> {
  await requireMembership(db, { ...input, minimumRole: "owner" });

  return db
    .select()
    .from(invite)
    .where(and(eq(invite.spaceId, input.spaceId), isNull(invite.acceptedAt)))
    .orderBy(asc(invite.createdAt), asc(invite.id));
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
