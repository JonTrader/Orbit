import { cache } from "react";
import { and, eq } from "drizzle-orm";

import type { OrbitDb } from "@/lib/db/client";
import { spaceMember, type SpaceRole } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";

/** The minimum Space role a caller must have for an operation. */
export type MinimumMembershipRole = SpaceRole;

export type MembershipErrorCode = "NOT_MEMBER" | "INSUFFICIENT_ROLE";

/**
 * Raised when a caller is not allowed to access a Space operation.
 *
 * Both cases are authorization failures and intentionally expose a 403 status
 * for the API layer. The code lets that layer distinguish a missing Member
 * from an insufficient role without duplicating the membership lookup.
 */
export class MembershipError extends DomainError<MembershipErrorCode> {
  readonly name = "MembershipError";
  readonly status = 403 as const;

  constructor(code: MembershipErrorCode, message: string) {
    super(code, message);
  }
}

const ROLE_RANK: Record<SpaceRole, number> = {
  "read-only": 0,
  editor: 1,
  owner: 2,
};

export interface MembershipLookupInput {
  userId: string;
  spaceId: string;
}

export interface RequireMembershipInput extends MembershipLookupInput {
  minimumRole?: MinimumMembershipRole;
}

async function queryMembership(
  db: OrbitDb,
  userId: string,
  spaceId: string,
): Promise<typeof spaceMember.$inferSelect | undefined> {
  const [membership] = await db
    .select()
    .from(spaceMember)
    .where(
      and(
        eq(spaceMember.spaceId, spaceId),
        eq(spaceMember.userId, userId),
      ),
    )
    .limit(1);

  return membership;
}

/**
 * Finds a Member row without applying a minimum role requirement.
 *
 * Request-cached so repeated lookups for the same user + Space within one
 * render pass (Viewer resolution, layout data, each service's own boundary
 * check) share one round trip. Outside a React request scope - plain Vitest
 * runs, scripts - this passes through uncached.
 *
 * Caveat: a flow that mutates membership and then re-reads it in the same
 * request would observe the pre-mutation row. No such flow exists today.
 */
export const findMembership = cache(queryMembership);

/**
 * Returns the caller's Member row when they meet the minimum role for a Space.
 *
 * Membership is the only access boundary for Space-owned data. Every service
 * that reads or mutates a Space should call this function before its query.
 * The default minimum is read-only, so a caller must still be a Member to
 * perform a read.
 */
export async function requireMembership(
  db: OrbitDb,
  input: RequireMembershipInput,
): Promise<typeof spaceMember.$inferSelect> {
  const minimumRole = input.minimumRole ?? "read-only";
  const membership = await findMembership(db, input.userId, input.spaceId);

  if (!membership) {
    throw new MembershipError(
      "NOT_MEMBER",
      "User is not a Member of this Space",
    );
  }

  if (ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
    throw new MembershipError(
      "INSUFFICIENT_ROLE",
      `The ${minimumRole} role is required for this Space operation`,
    );
  }

  return membership;
}
