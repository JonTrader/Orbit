import "../setup/api-mocks";
import "../setup/action-mocks";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  leaveSpace,
  listPendingInvites,
  removeMember,
  resendInvite,
  transferOwnership,
  updateMemberRole,
} from "@/lib/actions/members";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";
import { inviteMember } from "@/lib/services/members";
import { spaceLayoutPath, SPACES_PATH } from "@/lib/spaces/paths";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
  getSendEmailMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededSpace {
  ownerId: string;
  editorId: string;
  readOnlyId: string;
  spaceId: string;
}

async function seedSpace(): Promise<SeededSpace> {
  const owner = await createUser({ email: "owner@orbit.test" });
  const editor = await createUser({ email: "editor@orbit.test" });
  const readOnly = await createUser({ email: "read-only@orbit.test" });
  const seeded = await createSpaceWithSystemSections(testDb, {
    name: "Home",
    ownerUserId: owner.id,
  });

  await testDb.insert(spaceMember).values([
    { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
    { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
  ]);

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    spaceId: seeded.space.id,
  };
}

describe("member management actions", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
    getSendEmailMock().mockReset();
    getSendEmailMock().mockResolvedValue(undefined);
  });

  it("lists pending Invites for the Owner without revalidating", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);
    await inviteMember(testDb, {
      userId: s.ownerId,
      spaceId: s.spaceId,
      email: "pending@orbit.test",
    });
    getRevalidatePathMock().mockClear();

    const result = await listPendingInvites({ spaceId: s.spaceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      email: "pending@orbit.test",
      acceptedAt: null,
    });
    expect(result.data[0]).not.toHaveProperty("tokenDigest");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks Editors from listing pending Invites", async () => {
    const s = await seedSpace();
    authenticateAs(s.editorId);

    const result = await listPendingInvites({ spaceId: s.spaceId });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
  });

  it("resends an Invite and revalidates the Space layout", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);
    const pending = await inviteMember(testDb, {
      userId: s.ownerId,
      spaceId: s.spaceId,
      email: "resend@orbit.test",
    });
    getRevalidatePathMock().mockClear();
    getSendEmailMock().mockClear();

    const result = await resendInvite({
      spaceId: s.spaceId,
      inviteId: pending.id,
    });

    expect(result.ok).toBe(true);
    expect(getSendEmailMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("updates a Member role and removes a Member as Owner", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const roleResult = await updateMemberRole({
      spaceId: s.spaceId,
      targetUserId: s.editorId,
      role: "read-only",
    });
    expect(roleResult.ok).toBe(true);
    if (roleResult.ok) {
      expect(roleResult.data.role).toBe("read-only");
    }

    const removeResult = await removeMember({
      spaceId: s.spaceId,
      targetUserId: s.readOnlyId,
    });
    expect(removeResult.ok).toBe(true);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("transfers ownership and revalidates the Spaces directory", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await transferOwnership({
      spaceId: s.spaceId,
      targetUserId: s.editorId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.formerOwner.role).toBe("editor");
      expect(result.data.owner.role).toBe("owner");
    }
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
  });

  it("lets a non-Owner leave when another Space remains", async () => {
    const s = await seedSpace();
    await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: s.readOnlyId,
    });
    authenticateAs(s.readOnlyId);

    const result = await leaveSpace({ spaceId: s.spaceId });

    expect(result.ok).toBe(true);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
    const remaining = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.userId, s.readOnlyId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.spaceId).not.toBe(s.spaceId);
  });

  it("blocks Editors from Owner-only member mutations", async () => {
    const s = await seedSpace();
    authenticateAs(s.editorId);

    const denied = await Promise.all([
      updateMemberRole({
        spaceId: s.spaceId,
        targetUserId: s.readOnlyId,
        role: "editor",
      }),
      removeMember({
        spaceId: s.spaceId,
        targetUserId: s.readOnlyId,
      }),
      transferOwnership({
        spaceId: s.spaceId,
        targetUserId: s.readOnlyId,
      }),
    ]);

    for (const result of denied) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INSUFFICIENT_ROLE");
      }
    }
  });
});
