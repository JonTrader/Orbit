import "../setup/api-mocks";
import "../setup/action-mocks";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createSpace,
  deleteSpace,
  renameSpace,
} from "@/lib/actions/spaces";
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

describe("space actions", () => {
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

  describe("createSpace", () => {
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

  describe("renameSpace", () => {
    it("renames a Space and revalidates /spaces", async () => {
      const owner = await createUser();
      const seeded = await createSpaceWithSystemSections(testDb, {
        name: "Home",
        ownerUserId: owner.id,
      });
      authenticateAs(owner.id);

      const result = await renameSpace({
        spaceId: seeded.space.id,
        name: "  Family  ",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe("Family");
      expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
      expect(getRevalidatePathMock()).not.toHaveBeenCalledWith(
        `/spaces/${seeded.space.id}`,
        "layout",
      );
    });

    it("rejects a blank name as VALIDATION_ERROR and does not revalidate", async () => {
      const owner = await createUser();
      const seeded = await createSpaceWithSystemSections(testDb, {
        name: "Home",
        ownerUserId: owner.id,
      });
      authenticateAs(owner.id);

      const result = await renameSpace({
        spaceId: seeded.space.id,
        name: "   ",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
      const [row] = await testDb
        .select()
        .from(space)
        .where(eq(space.id, seeded.space.id));
      expect(row.name).toBe("Home");
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("propagates the verified-session redirect without renaming", async () => {
      const owner = await createUser();
      const seeded = await createSpaceWithSystemSections(testDb, {
        name: "Home",
        ownerUserId: owner.id,
      });
      guardRedirectsTo("/sign-in");

      await expect(
        renameSpace({ spaceId: seeded.space.id, name: "Family" }),
      ).rejects.toMatchObject({
        digest: expect.stringContaining("NEXT_REDIRECT"),
      });
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("surfaces PERSONAL_SPACE when renaming the Personal Space", async () => {
      const owner = await createUser();
      const { space: personal } = await createSpaceWithSystemSections(testDb, {
        name: "Personal",
        ownerUserId: owner.id,
        isPersonal: true,
      });
      authenticateAs(owner.id);

      const result = await renameSpace({
        spaceId: personal.id,
        name: "Renamed Personal",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERSONAL_SPACE");
      }
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });
  });

  describe("deleteSpace", () => {
    it("deletes a Space and revalidates /spaces", async () => {
      const owner = await createUser();
      const first = await createSpaceWithSystemSections(testDb, {
        name: "First",
        ownerUserId: owner.id,
      });
      await createSpaceWithSystemSections(testDb, {
        name: "Second",
        ownerUserId: owner.id,
      });
      authenticateAs(owner.id);

      const result = await deleteSpace({ spaceId: first.space.id });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(first.space.id);
      expect(await testDb.select().from(space)).toHaveLength(1);
      expect(getRevalidatePathMock()).toHaveBeenCalledWith(SPACES_PATH, "layout");
      expect(getRevalidatePathMock()).not.toHaveBeenCalledWith(
        `/spaces/${first.space.id}`,
        "layout",
      );
    });

    it("rejects an invalid spaceId as VALIDATION_ERROR and does not revalidate", async () => {
      const owner = await createUser();
      authenticateAs(owner.id);

      const result = await deleteSpace({ spaceId: "not-a-uuid" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("propagates the verified-session redirect without deleting", async () => {
      const owner = await createUser();
      const seeded = await createSpaceWithSystemSections(testDb, {
        name: "Home",
        ownerUserId: owner.id,
      });
      guardRedirectsTo("/sign-in");

      await expect(deleteSpace({ spaceId: seeded.space.id })).rejects.toMatchObject({
        digest: expect.stringContaining("NEXT_REDIRECT"),
      });
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });

    it("surfaces PERSONAL_SPACE when deleting the Personal Space", async () => {
      const owner = await createUser();
      const { space: personal } = await createSpaceWithSystemSections(testDb, {
        name: "Personal",
        ownerUserId: owner.id,
        isPersonal: true,
      });
      await createSpaceWithSystemSections(testDb, {
        name: "Other",
        ownerUserId: owner.id,
      });
      authenticateAs(owner.id);

      const result = await deleteSpace({ spaceId: personal.id });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("PERSONAL_SPACE");
      }
      expect(
        (await testDb.select().from(space)).map((row) => row.id),
      ).toContain(personal.id);
      expect(getRevalidatePathMock()).not.toHaveBeenCalled();
    });
  });
});
