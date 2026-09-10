import { ShareBar, type ShareBarMember } from "./ShareBar";

interface ShareBarSlotProps {
  spaceId: string;
  members: ShareBarMember[];
  canManageMembers: boolean;
  viewerUserId: string;
}

/**
 * Share bar chrome for the Active Space. Members come from getActiveSpace /
 * getSpaceLayoutData - this slot must not call listMembers on render.
 */
export function ShareBarSlot({
  spaceId,
  members,
  canManageMembers,
  viewerUserId,
}: ShareBarSlotProps) {
  return (
    <ShareBar
      spaceId={spaceId}
      members={members}
      canManageMembers={canManageMembers}
      viewerUserId={viewerUserId}
    />
  );
}
