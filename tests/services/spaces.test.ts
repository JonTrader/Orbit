import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MembershipError } from "@/lib/spaces/membership";
import {
  DEFAULT_SPACE_TIMEZONE,
  createSpaceWithSystemSections,
} from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";
import {
  SpaceError,
  createSpace,
  deleteSpace,
  getSpace,
  listSpaceDirectoryEntries,
  listSpaces,
  renameSpace,
  updateSpaceTimezone,
} from "@/lib/services/spaces";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Space services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("creates a Space with the creator as Owner and the system Sections", async () => {
    const creator = await createUser();

    const created = await createSpace(testDb, {
      userId: creator.id,
      name: "Home",
      timezone: "America/Chicago",
    });

    expect(created.name).toBe("Home");
    expect(created.timezone).toBe("America/Chicago");

    const sections = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, created.id))
      .orderBy(section.sortOrder);
    expect(sections.map((row) => row.kind)).toEqual(["daily", "monthlies"]);

    const [membership] = await testDb
      .select()
      .from(spaceMember)
      .where(eq(spaceMember.spaceId, created.id));
    expect(membership).toMatchObject({ userId: creator.id, role: "owner" });
  });

  it("defaults a missing timezone to UTC", async () => {
    const creator = await createUser();

    const created = await createSpace(testDb, {
      userId: creator.id,
      name: "Personal",
    });

    expect(created.timezone).toBe(DEFAULT_SPACE_TIMEZONE);
  });

  it("lists only Spaces where the caller is a Member", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const member = await createUser({ email: "member@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const home = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
    });
    const privateSpace = await createSpace(testDb, {
      userId: outsider.id,
      name: "Private",
    });

    await testDb.insert(spaceMember).values({
      spaceId: home.id,
      userId: member.id,
      role: "read-only",
    });

    await expect(listSpaces(testDb, member.id)).resolves.toMatchObject([
      { id: home.id, name: "Home" },
    ]);
    await expect(listSpaces(testDb, outsider.id)).resolves.toMatchObject([
      { id: privateSpace.id, name: "Private" },
    ]);
  });

  it("lists directory entries with Viewer roles, Member counts, and creation order", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });

    const first = await createSpace(testDb, {
      userId: owner.id,
      name: "Alpha",
      timezone: "America/Chicago",
    });
    const second = await createSpace(testDb, {
      userId: owner.id,
      name: "Beta",
      timezone: "Europe/London",
    });
    const privateSpace = await createSpace(testDb, {
      userId: outsider.id,
      name: "Private",
    });

    await testDb.insert(spaceMember).values([
      { spaceId: first.id, userId: editor.id, role: "editor" },
      { spaceId: first.id, userId: readOnly.id, role: "read-only" },
      { spaceId: second.id, userId: readOnly.id, role: "read-only" },
    ]);

    await expect(
      listSpaceDirectoryEntries(testDb, owner.id),
    ).resolves.toEqual([
      {
        id: first.id,
        name: "Alpha",
        timezone: "America/Chicago",
        isPersonal: false,
        role: "owner",
        memberCount: 3,
      },
      {
        id: second.id,
        name: "Beta",
        timezone: "Europe/London",
        isPersonal: false,
        role: "owner",
        memberCount: 2,
      },
    ]);

    await expect(
      listSpaceDirectoryEntries(testDb, editor.id),
    ).resolves.toEqual([
      {
        id: first.id,
        name: "Alpha",
        timezone: "America/Chicago",
        isPersonal: false,
        role: "editor",
        memberCount: 3,
      },
    ]);

    await expect(
      listSpaceDirectoryEntries(testDb, readOnly.id),
    ).resolves.toEqual([
      {
        id: first.id,
        name: "Alpha",
        timezone: "America/Chicago",
        isPersonal: false,
        role: "read-only",
        memberCount: 3,
      },
      {
        id: second.id,
        name: "Beta",
        timezone: "Europe/London",
        isPersonal: false,
        role: "read-only",
        memberCount: 2,
      },
    ]);

    await expect(
      listSpaceDirectoryEntries(testDb, outsider.id),
    ).resolves.toEqual([
      {
        id: privateSpace.id,
        name: "Private",
        timezone: DEFAULT_SPACE_TIMEZONE,
        isPersonal: false,
        role: "owner",
        memberCount: 1,
      },
    ]);
  });

  it("gets a Space for a Member and denies a non-member", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const stranger = await createUser({ email: "stranger@orbit.test" });
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
    });

    await expect(
      getSpace(testDb, { userId: owner.id, spaceId: created.id }),
    ).resolves.toMatchObject({ id: created.id, name: "Home" });
    await expect(
      getSpace(testDb, { userId: stranger.id, spaceId: created.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
  });

  it("allows only the Owner to update the Space timezone", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
      timezone: "UTC",
    });
    await testDb.insert(spaceMember).values([
      { spaceId: created.id, userId: editor.id, role: "editor" },
      { spaceId: created.id, userId: readOnly.id, role: "read-only" },
    ]);

    const updated = await updateSpaceTimezone(testDb, {
      userId: owner.id,
      spaceId: created.id,
      timezone: " Europe/London ",
    });
    expect(updated.timezone).toBe("Europe/London");

    for (const userId of [editor.id, readOnly.id]) {
      await expect(
        updateSpaceTimezone(testDb, {
          userId,
          spaceId: created.id,
          timezone: "America/Chicago",
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }
  });

  it("rejects invalid timezones without changing the Space", async () => {
    const owner = await createUser();
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
      timezone: "UTC",
    });

    await expect(
      updateSpaceTimezone(testDb, {
        userId: owner.id,
        spaceId: created.id,
        timezone: "Not/A-Timezone",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TIMEZONE",
    });
    await expect(getSpace(testDb, { userId: owner.id, spaceId: created.id })).resolves.toMatchObject({
      timezone: "UTC",
    });
  });

  it("renames a Space and bumps updated_at", async () => {
    const owner = await createUser();
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const renamed = await renameSpace(testDb, {
      userId: owner.id,
      spaceId: created.id,
      name: "Renamed Home",
    });

    expect(renamed.name).toBe("Renamed Home");
    expect(renamed.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
  });

  it("requires the Owner role to rename a Space", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const stranger = await createUser({ email: "stranger@orbit.test" });
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
    });
    await testDb.insert(spaceMember).values([
      { spaceId: created.id, userId: editor.id, role: "editor" },
      { spaceId: created.id, userId: readOnly.id, role: "read-only" },
    ]);

    for (const userId of [editor.id, readOnly.id]) {
      await expect(
        renameSpace(testDb, {
          userId,
          spaceId: created.id,
          name: "Nope",
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }

    await expect(
      renameSpace(testDb, {
        userId: stranger.id,
        spaceId: created.id,
        name: "Nope",
      }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
  });

  it("rejects renaming the Personal Space", async () => {
    const owner = await createUser();
    const { space: personal } = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
      ownerUserId: owner.id,
      isPersonal: true,
    });

    await expect(
      renameSpace(testDb, {
        userId: owner.id,
        spaceId: personal.id,
        name: "Renamed Personal",
      }),
    ).rejects.toMatchObject({
      code: "PERSONAL_SPACE",
    });
    await expect(
      getSpace(testDb, { userId: owner.id, spaceId: personal.id }),
    ).resolves.toMatchObject({ name: "Personal", isPersonal: true });
  });

  it("blocks deleting the Owner's last remaining Space", async () => {
    const owner = await createUser();
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Only Space",
    });

    await expect(
      deleteSpace(testDb, { userId: owner.id, spaceId: created.id }),
    ).rejects.toMatchObject({ code: "LAST_SPACE" });
    await expect(
      getSpace(testDb, { userId: owner.id, spaceId: created.id }),
    ).resolves.toMatchObject({ id: created.id });
  });

  it("rejects deleting the Personal Space when another Space remains", async () => {
    const owner = await createUser();
    const { space: personal } = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
      ownerUserId: owner.id,
      isPersonal: true,
    });
    await createSpace(testDb, {
      userId: owner.id,
      name: "Other",
    });

    await expect(
      deleteSpace(testDb, { userId: owner.id, spaceId: personal.id }),
    ).rejects.toMatchObject({ code: "PERSONAL_SPACE" });
    await expect(
      getSpace(testDb, { userId: owner.id, spaceId: personal.id }),
    ).resolves.toMatchObject({ id: personal.id, isPersonal: true });
  });

  it("reports LAST_SPACE before PERSONAL_SPACE when Personal is the only Space", async () => {
    const owner = await createUser();
    const { space: personal } = await createSpaceWithSystemSections(testDb, {
      name: "Personal",
      ownerUserId: owner.id,
      isPersonal: true,
    });

    await expect(
      deleteSpace(testDb, { userId: owner.id, spaceId: personal.id }),
    ).rejects.toMatchObject({ code: "LAST_SPACE" });
  });

  it("lets the Owner delete a Space when another Space remains", async () => {
    const owner = await createUser();
    const first = await createSpace(testDb, {
      userId: owner.id,
      name: "First",
    });
    const second = await createSpace(testDb, {
      userId: owner.id,
      name: "Second",
    });

    await expect(
      deleteSpace(testDb, { userId: owner.id, spaceId: first.id }),
    ).resolves.toMatchObject({ id: first.id });
    await expect(
      getSpace(testDb, { userId: owner.id, spaceId: first.id }),
    ).rejects.toBeInstanceOf(MembershipError);
    await expect(listSpaces(testDb, owner.id)).resolves.toMatchObject([
      { id: second.id, name: "Second" },
    ]);
  });

  it("requires the Owner role to delete a Space", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const created = await createSpace(testDb, {
      userId: owner.id,
      name: "Home",
    });
    await testDb.insert(spaceMember).values({
      spaceId: created.id,
      userId: editor.id,
      role: "editor",
    });

    await expect(
      deleteSpace(testDb, { userId: editor.id, spaceId: created.id }),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_ROLE",
      status: 403,
    });
  });

  it("rejects a missing timezone when creating a Space", async () => {
    const creator = await createUser();

    await expect(
      createSpace(testDb, {
        userId: creator.id,
        name: "Home",
        timezone: "Not/A-Timezone",
      }),
    ).rejects.toBeInstanceOf(SpaceError);
  });
});
