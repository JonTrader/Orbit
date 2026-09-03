import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// `ShareBar` imports the server action `sendInvite` (and that action pulls in
// Better Auth config at import-time). This component test only verifies
// prop plumbing, so we stub the server action to avoid requiring DATABASE_URL.
vi.mock("@/lib/actions/invites", () => ({
  sendInvite: vi.fn().mockResolvedValue({ ok: true, data: null }),
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
    }) as ReactElement<{
      spaceId: string;
      members: typeof members;
      canManageMembers: boolean;
    }>;

    expect(spy).not.toHaveBeenCalled();
    expect(result.props).toMatchObject({
      spaceId: "space-1",
      members,
      canManageMembers: true,
    });
    spy.mockRestore();
  });
});
