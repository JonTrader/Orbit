import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MembershipError, requireMembership } from "@/lib/spaces/membership";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../../setup/db";
import { createUser } from "../../setup/fixtures";

describe("requireMembership", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("denies a non-member, including a Member of another Space", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const otherMember = await createUser({ email: "other@orbit.test" });
    const stranger = await createUser({ email: "stranger@orbit.test" });
    const home = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherMember.id,
    });

    await expect(
      requireMembership(testDb, {
        userId: stranger.id,
        spaceId: home.space.id,
      }),
    ).rejects.toMatchObject({
      code: "NOT_MEMBER",
      status: 403,
    });

    await expect(
      requireMembership(testDb, {
        userId: otherMember.id,
        spaceId: home.space.id,
      }),
    ).rejects.toBeInstanceOf(MembershipError);

    await expect(
      requireMembership(testDb, {
        userId: owner.id,
        spaceId: other.space.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
  });

  it("allows each Member to read but enforces the requested minimum role", async () => {
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

    for (const member of [
      { userId: owner.id, role: "owner" as const },
      { userId: editor.id, role: "editor" as const },
      { userId: readOnly.id, role: "read-only" as const },
    ]) {
      await expect(
        requireMembership(testDb, {
          userId: member.userId,
          spaceId: space.id,
        }),
      ).resolves.toMatchObject({ userId: member.userId, role: member.role });
    }

    for (const minimumRole of ["editor", "owner"] as const) {
      await expect(
        requireMembership(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          minimumRole,
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }

    await expect(
      requireMembership(testDb, {
        userId: editor.id,
        spaceId: space.id,
        minimumRole: "editor",
      }),
    ).resolves.toMatchObject({ role: "editor" });

    await expect(
      requireMembership(testDb, {
        userId: editor.id,
        spaceId: space.id,
        minimumRole: "owner",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });

    for (const minimumRole of ["read-only", "editor", "owner"] as const) {
      await expect(
        requireMembership(testDb, {
          userId: owner.id,
          spaceId: space.id,
          minimumRole,
        }),
      ).resolves.toMatchObject({ role: "owner" });
    }
  });
});
