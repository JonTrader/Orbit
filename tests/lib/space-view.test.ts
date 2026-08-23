import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { spaceMember, type SpaceRole } from "@/lib/db/schema";
import { createSpace } from "@/lib/services/spaces";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

class RedirectedError extends Error {
  constructor(readonly url: string) {
    super(`redirected to ${url}`);
  }
}

class NotFoundSignal extends Error {}

const viewMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  requireVerifiedSession: vi.fn(),
  database: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: viewMocks.redirect,
  notFound: viewMocks.notFound,
}));

vi.mock("@/lib/session", () => ({
  requireVerifiedSession: viewMocks.requireVerifiedSession,
}));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    getDb: () => viewMocks.database,
  };
});

import {
  getSpaceSections,
  getSpaceViewer,
  resolveSpaceContext,
} from "@/lib/space-view";

/** Points the mocked session guard at one verified Viewer. */
function authenticateAs(userId: string, name = "Jonathan"): void {
  viewMocks.requireVerifiedSession.mockResolvedValue({
    user: { id: userId, name, email: `${userId}@orbit.test` },
  });
}

/** Makes the session guard redirect, as it does for unverified callers. */
function guardRedirectsTo(url: string): void {
  viewMocks.requireVerifiedSession.mockRejectedValue(new RedirectedError(url));
}

describe("Space viewer context", () => {
  beforeAll(async () => {
    await migrateTestDb();
    viewMocks.database = testDb;
  });

  beforeEach(async () => {
    await truncateAll();
    viewMocks.redirect.mockImplementation((url: string) => {
      throw new RedirectedError(url);
    });
    viewMocks.notFound.mockImplementation(() => {
      throw new NotFoundSignal("not found");
    });
  });

  describe("resolveSpaceContext", () => {
    it("returns the Space id from awaited params", async () => {
      const spaceId = crypto.randomUUID();
      await expect(
        resolveSpaceContext({ spaceId }),
      ).resolves.toBe(spaceId);
    });

    it("accepts the params promise directly", async () => {
      const spaceId = crypto.randomUUID();
      await expect(
        resolveSpaceContext(Promise.resolve({ spaceId })),
      ).resolves.toBe(spaceId);
    });

    it("signals not-found for a malformed Space id", async () => {
      await expect(
        resolveSpaceContext({ spaceId: "not-a-uuid" }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
    });
  });

  describe("getSpaceViewer capability matrix", () => {
    it.each([
      ["owner", { mutateContent: true, manageMembers: true }],
      ["editor", { mutateContent: true, manageMembers: false }],
      ["read-only", { mutateContent: false, manageMembers: false }],
    ] as const)(
      "resolves %s capabilities",
      async (role, can) => {
        const owner = await createUser({ email: "owner@orbit.test" });
        const member = await createUser({ email: "member@orbit.test" });
        const created = await createSpace(testDb, {
          userId: owner.id,
          name: "Home",
        });

        if (role !== "owner") {
          await testDb
            .insert(spaceMember)
            .values({ spaceId: created.id, userId: member.id, role });
        }

        const actor = role === "owner" ? owner : member;
        authenticateAs(actor.id);

        const viewer = await getSpaceViewer(created.id);
        expect(viewer.userId).toBe(actor.id);
        expect(viewer.user.name).toBe("Jonathan");
        expect(viewer.user.email).toBe(`${actor.id}@orbit.test`);
        expect(viewer.role).toBe(role satisfies SpaceRole);
        expect(viewer.can).toEqual(can);
        expect(viewer.space.id).toBe(created.id);
        expect(viewer.space.name).toBe("Home");
      },
    );
  });

  describe("getSpaceViewer failure modes", () => {
    it("propagates the session guard redirect for unverified callers", async () => {
      guardRedirectsTo("/verify-email");

      await expect(getSpaceViewer(crypto.randomUUID())).rejects.toThrow(
        RedirectedError,
      );
      await expect(getSpaceViewer(crypto.randomUUID())).rejects.toMatchObject({
        url: "/verify-email",
      });
    });

    it("redirects a non-member of an existing Space to the app root", async () => {
      const owner = await createUser({ email: "owner@orbit.test" });
      const outsider = await createUser({ email: "outsider@orbit.test" });
      const created = await createSpace(testDb, {
        userId: owner.id,
        name: "Home",
      });
      authenticateAs(outsider.id);

      await expect(getSpaceViewer(created.id)).rejects.toMatchObject({
        url: "/",
      });
    });

    it("signals not-found for an unknown Space id", async () => {
      const stranger = await createUser({ email: "stranger@orbit.test" });
      authenticateAs(stranger.id);

      await expect(getSpaceViewer(crypto.randomUUID())).rejects.toBeInstanceOf(
        NotFoundSignal,
      );
    });
  });

  describe("getSpaceSections", () => {
    it("lists the Space's Sections for a Member, system Sections first", async () => {
      const owner = await createUser({ email: "owner@orbit.test" });
      const created = await createSpace(testDb, {
        userId: owner.id,
        name: "Home",
      });
      authenticateAs(owner.id);

      const sections = await getSpaceSections(created.id);

      const kinds = sections.map((row) => row.kind);
      expect(kinds).toContain("daily");
      expect(kinds).toContain("monthlies");
      // System Sections are pinned to the top by listSections' ordering.
      const firstCustomIndex = sections.findIndex((row) => !row.isSystem);
      if (firstCustomIndex !== -1) {
        const tail = sections.slice(firstCustomIndex);
        expect(tail.some((row) => row.isSystem)).toBe(false);
      }
    });

    it("inherits the Viewer failure modes for non-members", async () => {
      const owner = await createUser({ email: "owner@orbit.test" });
      const outsider = await createUser({ email: "outsider@orbit.test" });
      const created = await createSpace(testDb, {
        userId: owner.id,
        name: "Home",
      });
      authenticateAs(outsider.id);

      await expect(getSpaceSections(created.id)).rejects.toMatchObject({
        url: "/",
      });
    });
  });
});
