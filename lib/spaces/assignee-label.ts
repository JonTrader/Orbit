import { roleLabel } from "@/lib/spaces/role-label";

import type { SpaceMemberPreview } from "./viewer";

/** Resolve a display name for a stored Assignee id. */
export function assigneeLabel(
  assigneeId: string | null,
  members: readonly SpaceMemberPreview[],
): string | null {
  if (!assigneeId) return null;
  const match = members.find((member) => member.userId === assigneeId);
  return match ? match.name : "Former Member";
}

/** Option text for a Member in the Assignee picker. */
export function memberOptionLabel(
  member: SpaceMemberPreview,
  members: readonly SpaceMemberPreview[],
): string {
  const shared = members.some(
    (other) => other.userId !== member.userId && other.name === member.name,
  );
  return shared ? `${member.name} (${roleLabel(member.role)})` : member.name;
}
