import { findMembership } from "@/lib/spaces/membership";
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

  const membership = await findMembership(db, assigneeId, spaceId);

  if (!membership) {
    throw createError(INVALID_ASSIGNEE_MESSAGE);
  }
}
