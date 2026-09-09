import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { invite, spaceMember } from "@/lib/db/schema";
import {
  acceptInvite,
  inviteMember,
  leaveSpace,
  listMembers,
  listPendingInvites,
  MemberError,
  removeMember,
  resendInvite,
  transferOwnership,
  updateMemberRole,
} from "@/lib/services/members";
import { deleteSpace } from "@/lib/services/spaces";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Member and Invite services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("creates default read-only and editor Invites with seven-day expiry", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    const before = Date.now();
    const readOnly = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: " Partner@Orbit.Test ",
    });
    const editor = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "editor@orbit.test",
      role: "editor",
    });

    expect(readOnly).toMatchObject({
      email: "partner@orbit.test",
      role: "read-only",
      invitedBy: owner.id,
      acceptedAt: null,
    });
    expect(editor.role).toBe("editor");
    expect(readOnly.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1_000 - 100,
    );
    expect(readOnly.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 7 * 24 * 60 * 60 * 1_000 + 100,
    );
  });

  it("lists pending Invites for a Space, scoped and Owner-only", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const otherSpace = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: space.id, userId: editor.id, role: "editor" },
      { spaceId: space.id, userId: readOnly.id, role: "read-only" },
    ]);

    const pendingHome = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "pending@orbit.test",
    });
    const acceptedHome = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "accepted@orbit.test",
    });
    await testDb
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.id, acceptedHome.id));
    await inviteMember(testDb, {
      userId: owner.id,
      spaceId: otherSpace.space.id,
      email: "other@orbit.test",
    });

    const pending = await listPendingInvites(testDb, {
      userId: owner.id,
      spaceId: space.id,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: pendingHome.id,
      spaceId: space.id,
      email: "pending@orbit.test",
      acceptedAt: null,
    });

    await expect(
      listPendingInvites(testDb, { userId: editor.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      listPendingInvites(testDb, { userId: readOnly.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
  });

  it("accepts a matching Invite and creates the Member only then", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const recipient = await createUser({ email: "partner@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const pending = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: recipient.email,
      role: "editor",
    });

    await expect(
      listMembers(testDb, { userId: owner.id, spaceId: space.id }),
    ).resolves.toHaveLength(1);

    const accepted = await acceptInvite(testDb, {
      userId: recipient.id,
      token: pending.token,
    });
    expect(accepted).toMatchObject({
      spaceId: space.id,
      userId: recipient.id,
      role: "editor",
    });
    await expect(
      listMembers(testDb, { userId: recipient.id, spaceId: space.id }),
    ).resolves.toMatchObject([
      { userId: owner.id, role: "owner" },
      { userId: recipient.id, role: "editor" },
    ]);

    const [stored] = await testDb
      .select()
      .from(invite)
      .where(eq(invite.id, pending.id));
    expect(stored.acceptedAt).toBeInstanceOf(Date);
  });

  it("rejects expired and email-mismatched Invites, and resend refreshes expiry", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const recipient = await createUser({ email: "partner@orbit.test" });
    const wrongUser = await createUser({ email: "wrong@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const pending = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: recipient.email,
    });

    await expect(
      acceptInvite(testDb, { userId: wrongUser.id, token: pending.token }),
    ).rejects.toMatchObject({ code: "EMAIL_MISMATCH" });

    const oldExpiry = new Date(Date.now() - 1_000);
    await testDb
      .update(invite)
      .set({ expiresAt: oldExpiry })
      .where(eq(invite.id, pending.id));
    await expect(
      acceptInvite(testDb, { userId: recipient.id, token: pending.token }),
    ).rejects.toMatchObject({ code: "EXPIRED_INVITE" });

    const resent = await resendInvite(testDb, {
      userId: owner.id,
      inviteId: pending.id,
    });
    expect(resent.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(
      acceptInvite(testDb, { userId: recipient.id, token: pending.token }),
    ).resolves.toMatchObject({ userId: recipient.id, role: "read-only" });
  });

  it("lists Members and lets only the Owner change roles or remove Members", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: space.id, userId: editor.id, role: "editor" },
      { spaceId: space.id, userId: readOnly.id, role: "read-only" },
    ]);

    const members = await listMembers(testDb, {
      userId: readOnly.id,
      spaceId: space.id,
    });
    expect(members).toHaveLength(3);
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: owner.id,
          email: owner.email,
          role: "owner",
        }),
        expect.objectContaining({ userId: editor.id, role: "editor" }),
        expect.objectContaining({ userId: readOnly.id, role: "read-only" }),
      ]),
    );

    await expect(
      updateMemberRole(testDb, {
        userId: owner.id,
        spaceId: space.id,
        targetUserId: editor.id,
        role: "read-only",
      }),
    ).resolves.toMatchObject({ userId: editor.id, role: "read-only" });
    await expect(
      updateMemberRole(testDb, {
        userId: editor.id,
        spaceId: space.id,
        targetUserId: readOnly.id,
        role: "editor",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      updateMemberRole(testDb, {
        userId: owner.id,
        spaceId: space.id,
        targetUserId: owner.id,
        role: "editor",
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_TRANSFER_REQUIRED" });

    await expect(
      removeMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        targetUserId: readOnly.id,
      }),
    ).resolves.toMatchObject({ userId: readOnly.id });
    await expect(
      removeMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        targetUserId: owner.id,
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_TRANSFER_REQUIRED" });
  });

  it("transfers ownership atomically and demotes the former Owner", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: space.id,
      userId: editor.id,
      role: "editor",
    });

    const transferred = await transferOwnership(testDb, {
      userId: owner.id,
      spaceId: space.id,
      targetUserId: editor.id,
    });
    expect(transferred.formerOwner).toMatchObject({
      userId: owner.id,
      role: "editor",
    });
    expect(transferred.owner).toMatchObject({
      userId: editor.id,
      role: "owner",
    });

    await expect(
      updateMemberRole(testDb, {
        userId: owner.id,
        spaceId: space.id,
        targetUserId: editor.id,
        role: "read-only",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      updateMemberRole(testDb, {
        userId: editor.id,
        spaceId: space.id,
        targetUserId: owner.id,
        role: "read-only",
      }),
    ).resolves.toMatchObject({ userId: owner.id, role: "read-only" });
  });

  it("guards leaving the last Space and leaving as Owner before transfer", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const member = await createUser({ email: "member@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: space.id,
      userId: member.id,
      role: "read-only",
    });

    await expect(
      leaveSpace(testDb, { userId: member.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "LAST_SPACE" });
    await expect(
      leaveSpace(testDb, { userId: owner.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "LAST_SPACE" });
  });

  it("requires an Owner to delete, rather than leave, an empty non-last Space", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: owner.id,
    });

    await expect(
      leaveSpace(testDb, { userId: owner.id, spaceId: home.space.id }),
    ).rejects.toMatchObject({ code: "OWNER_CANNOT_LEAVE" });
    await expect(
      deleteSpace(testDb, { userId: owner.id, spaceId: home.space.id }),
    ).resolves.toMatchObject({ id: home.space.id });
    await expect(
      listMembers(testDb, { userId: owner.id, spaceId: other.space.id }),
    ).resolves.toMatchObject([{ userId: owner.id, role: "owner" }]);
  });

  it("lets a former Owner leave after transfer when another Space remains", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: home.space.id,
      userId: editor.id,
      role: "editor",
    });
    await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: owner.id,
    });

    await expect(
      leaveSpace(testDb, { userId: owner.id, spaceId: home.space.id }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_TRANSFER_REQUIRED" });
    await transferOwnership(testDb, {
      userId: owner.id,
      spaceId: home.space.id,
      targetUserId: editor.id,
    });
    await expect(
      leaveSpace(testDb, { userId: owner.id, spaceId: home.space.id }),
    ).resolves.toMatchObject({ userId: owner.id, role: "editor" });
  });

  it("allows a non-Owner to leave when another Space remains", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const member = await createUser({ email: "member@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: home.space.id,
      userId: member.id,
      role: "read-only",
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: member.id,
    });

    await expect(
      leaveSpace(testDb, { userId: member.id, spaceId: home.space.id }),
    ).resolves.toMatchObject({ userId: member.id, spaceId: home.space.id });
    await expect(
      listMembers(testDb, { userId: member.id, spaceId: other.space.id }),
    ).resolves.toMatchObject([{ userId: member.id, role: "owner" }]);
  });

  it("rejects a duplicate pending Invite for the same Space and email", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "pending@orbit.test",
    });

    await expect(
      inviteMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        email: "Pending@Orbit.Test",
      }),
    ).rejects.toMatchObject({
      code: "INVITE_ALREADY_PENDING",
      message: "An Invite is already pending for that email in this Space",
    });

    const accepted = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "accepted@orbit.test",
    });
    await testDb
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.id, accepted.id));
    await expect(
      inviteMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        email: "accepted@orbit.test",
      }),
    ).resolves.toMatchObject({
      email: "accepted@orbit.test",
      acceptedAt: null,
    });
  });

  it("rejects owner-only actions for invalid roles and missing Members", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const stranger = await createUser({ email: "stranger@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await expect(
      inviteMember(testDb, {
        userId: stranger.id,
        spaceId: space.id,
        email: "new@orbit.test",
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      inviteMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        email: "new@orbit.test",
        role: "owner" as never,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ROLE" });
    await expect(
      inviteMember(testDb, {
        userId: owner.id,
        spaceId: space.id,
        email: "not-an-email",
      }),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });

  it("denies Owner-only membership ops to Editors", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const target = await createUser({ email: "target@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: space.id, userId: editor.id, role: "editor" },
      { spaceId: space.id, userId: target.id, role: "read-only" },
    ]);
    const pending = await inviteMember(testDb, {
      userId: owner.id,
      spaceId: space.id,
      email: "pending@orbit.test",
    });

    const denied = [
      () =>
        inviteMember(testDb, {
          userId: editor.id,
          spaceId: space.id,
          email: "via-editor@orbit.test",
        }),
      () =>
        resendInvite(testDb, {
          userId: editor.id,
          inviteId: pending.id,
        }),
      () =>
        removeMember(testDb, {
          userId: editor.id,
          spaceId: space.id,
          targetUserId: target.id,
        }),
      () =>
        transferOwnership(testDb, {
          userId: editor.id,
          spaceId: space.id,
          targetUserId: target.id,
        }),
    ] as const;

    for (const action of denied) {
      await expect(action()).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }
  });

  it("exposes structured Member errors", () => {
    const error = new MemberError("LAST_SPACE", "Cannot leave");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("LAST_SPACE");
  });
});
