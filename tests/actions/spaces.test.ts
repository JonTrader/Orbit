import "../setup/api-mocks";
import "../setup/action-mocks";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpace } from "@/lib/actions/spaces";
import { DEFAULT_SPACE_TIMEZONE, createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, space, spaceMember } from "@/lib/db/schema";
import { SPACES_PATH } from "@/lib/spaces/paths";

import {
  authenticateAs,
  getReadCreatorTimeZoneMock,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
  guardRedirectsTo,
  setCreatorTimeZone,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("createSpace action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
    getReadCreatorTimeZoneMock().mockReset();
    setCreatorTimeZone(undefined);
  });

  it("creates a trimmed-name Space with the browser timezone", async () => {
    const creator = await createUser();
    authenticateAs(creator.id);
    setCreatorTimeZone("America/Chicago");

    const result = await createSpace({ name: "  Home  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Home");
    expect(result.data.timezone).toBe("America/Chicago");
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
  });

  it("falls back to UTC when the creator timezone cookie is missing", async () => {
    const creator = await createUser();
    authenticateAs(creator.id);
    setCreatorTimeZone(undefined);

    const result = await createSpace({ name: "Personal" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.timezone).toBe(DEFAULT_SPACE_TIMEZONE);
  });

  it("makes the caller Owner and seeds Daily and Monthlies", async () => {
    const creator = await createUser();
    authenticateAs(creator.id);

    const result = await createSpace({ name: "Family" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [membership] = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, result.data.id));
    expect(membership).toMatchObject({
      userId: creator.id,
      role: "owner",
    });

    const sections = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, result.data.id))
      .orderBy(section.sortOrder);
    expect(sections.map((row) => row.kind)).toEqual(["daily", "monthlies"]);
  });

  it("rejects a blank name as VALIDATION_ERROR and creates nothing", async () => {
    const creator = await createUser();
    authenticateAs(creator.id);

    const result = await createSpace({ name: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await testDb.select().from(space)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("propagates the verified-session redirect without creating a Space", async () => {
    guardRedirectsTo("/sign-in");

    await expect(createSpace({ name: "Home" })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(await testDb.select().from(space)).toHaveLength(0);
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("lets a read-only Member elsewhere create a Space they own", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Shared",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: readOnly.id,
      role: "read-only",
    });

    authenticateAs(readOnly.id);
    setCreatorTimeZone("Europe/London");

    const result = await createSpace({ name: "Mine" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Mine");

    const [membership] = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, result.data.id));
    expect(membership).toMatchObject({
      userId: readOnly.id,
      role: "owner",
    });
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
  });
});
