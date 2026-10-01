import {
  ShareBar,
  type ShareBarMember,
  type ShareBarReminderPreference,
} from "./ShareBar";

interface ShareBarSlotProps {
  spaceId: string;
  members: ShareBarMember[];
  canManageMembers: boolean;
  viewerUserId: string;
  reminder: ShareBarReminderPreference;
}

/**
 * Share bar chrome for the Active Space. Members and the Viewer's Reminder
 * preference come from getActiveSpace / getSpaceLayoutData - this slot must
 * not call listMembers or load preferences on render.
 */
export function ShareBarSlot({
  spaceId,
  members,
  canManageMembers,
  viewerUserId,
  reminder,
}: ShareBarSlotProps) {
  return (
    <ShareBar
      spaceId={spaceId}
      members={members}
      canManageMembers={canManageMembers}
      viewerUserId={viewerUserId}
      reminder={reminder}
    />
  );
}
