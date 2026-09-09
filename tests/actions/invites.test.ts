import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sendInvite } from "@/lib/actions/invites";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { invite, spaceMember } from "@/lib/db/schema";

import { authenticateAs, getRevalidatePathMock, getRequireVerifiedSessionMock } from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

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

describe("sendInvite action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("creates a pending Invite with a token and seven-day expiry", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "Newcomer@Orbit.test ",
      role: "editor",
    });

    if (!result.ok) {
      throw new Error("Expected a created Invite");
    }
    expect(result.data.email).toBe("newcomer@orbit.test");
    expect(result.data.role).toBe("editor");
    expect(result.data.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.data.acceptedAt).toBeNull();

    const expectedExpiry = Date.now() + SEVEN_DAYS_MS;
    expect(Math.abs(result.data.expiresAt.getTime() - expectedExpiry)).toBeLessThan(
      5_000,
    );
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(spaceLayoutPath(s.spaceId), "layout");
  });

  it("defaults the role to read-only when omitted", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "default-role@orbit.test",
    });

    if (!result.ok) {
      throw new Error("Expected a created Invite");
    }
    expect(result.data.role).toBe("read-only");
  });

  it("rejects a duplicate pending Invite for the same email", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);
    await sendInvite({
      spaceId: s.spaceId,
      email: "pending@orbit.test",
    });

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "pending@orbit.test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVITE_ALREADY_PENDING");
    }
    const rows = await testDb.select().from(invite);
    expect(rows).toHaveLength(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1); // first call only
  });

  it("rejects an invalid email as a validation error", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "not-an-email",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await testDb.select().from(invite)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects inviting with role owner as a validation error", async () => {
    const s = await seedSpace();
    authenticateAs(s.ownerId);

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "owner-role@orbit.test",
      role: "owner" as "editor",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await testDb.select().from(invite)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks Editors and read-only Members; only the Owner invites", async () => {
    const s = await seedSpace();
    authenticateAs(s.editorId);

    const editorResult = await sendInvite({
      spaceId: s.spaceId,
      email: "via-editor@orbit.test",
    });

    authenticateAs(s.readOnlyId);
    const readOnlyResult = await sendInvite({
      spaceId: s.spaceId,
      email: "via-read-only@orbit.test",
    });

    for (const result of [editorResult, readOnlyResult]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INSUFFICIENT_ROLE");
      }
    }
    expect(await testDb.select().from(invite)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const s = await seedSpace();
    authenticateAs(outsider.id);

    const result = await sendInvite({
      spaceId: s.spaceId,
      email: "outsider-invite@orbit.test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(await testDb.select().from(invite)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
