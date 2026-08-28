import { getDb } from "@/lib/db/client";
import { listMembers } from "@/lib/services/members";

import { ShareBar, type ShareBarMember } from "./ShareBar";

interface ShareBarSlotProps {
  userId: string;
  spaceId: string;
  canManageMembers: boolean;
}

/**
 * Server-rendered member fetch for the share bar. Streams into SpaceLayout
 * so the Active Space chrome never waits for it.
 */
export async function ShareBarSlot({
  userId,
  spaceId,
  canManageMembers,
}: ShareBarSlotProps) {
  const members = await listMembers(getDb(), { userId, spaceId });

  const mapped: ShareBarMember[] = members.map((member) => ({
    userId: member.userId,
    name: member.name,
    role: member.role,
  }));

  return (
    <ShareBar
      spaceId={spaceId}
      members={mapped}
      canManageMembers={canManageMembers}
    />
  );
}
