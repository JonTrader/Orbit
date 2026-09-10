import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// ShareBar imports Server Actions that pull Better Auth at import-time.
vi.mock("@/lib/actions/invites", () => ({
  sendInvite: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

vi.mock("@/lib/actions/members", () => ({
  listPendingInvites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  resendInvite: vi.fn().mockResolvedValue({ ok: true, data: null }),
  updateMemberRole: vi.fn().mockResolvedValue({ ok: true, data: null }),
  removeMember: vi.fn().mockResolvedValue({ ok: true, data: null }),
  transferOwnership: vi.fn().mockResolvedValue({ ok: true, data: null }),
  leaveSpace: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

import { ShareBarSlot } from "@/components/spaces/ShareBarSlot";
import * as membersService from "@/lib/services/members";

describe("ShareBarSlot", () => {
  it("does not call listMembers on render when given layout members", () => {
    const spy = vi.spyOn(membersService, "listMembers");
    const members = [
      { userId: "user-1", name: "Owner", role: "owner" as const },
    ];

    const result = ShareBarSlot({
      spaceId: "space-1",
      members,
      canManageMembers: true,
      viewerUserId: "user-1",
    }) as ReactElement<{
      spaceId: string;
      members: typeof members;
      canManageMembers: boolean;
      viewerUserId: string;
    }>;

    expect(spy).not.toHaveBeenCalled();
    expect(result.props).toMatchObject({
      spaceId: "space-1",
      members,
      canManageMembers: true,
      viewerUserId: "user-1",
    });
    spy.mockRestore();
  });
});
