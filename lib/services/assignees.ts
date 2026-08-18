import { findMembership } from "@/lib/authz/require-membership";
import type { OrbitDb } from "@/lib/db/client";

const INVALID_ASSIGNEE_MESSAGE = "Assignee must be a Member of this Space";

/** Validates an optional Assignee while preserving each domain's error type. */
export async function assertAssigneeIsMember(
  db: OrbitDb,
  spaceId: string,
  assigneeId: string | null | undefined,
  createError: (message: string) => Error,
): Promise<void> {
  if (assigneeId == null) return;

  const membership = await findMembership(db, {
    spaceId,
    userId: assigneeId,
  });

  if (!membership) {
    throw createError(INVALID_ASSIGNEE_MESSAGE);
  }
}
