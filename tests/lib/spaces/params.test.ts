import { beforeEach, describe, expect, it, vi } from "vitest";

class NotFoundSignal extends Error {}

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: navigationMocks.notFound,
}));

import {
  resolveCustomSectionContext,
  resolveSpaceContext,
} from "@/lib/spaces/params";

describe("Space route params", () => {
  beforeEach(() => {
    navigationMocks.notFound.mockImplementation(() => {
      throw new NotFoundSignal("not found");
    });
  });

  describe("resolveSpaceContext", () => {
    it("returns the Space id from awaited params", async () => {
      const spaceId = crypto.randomUUID();
      await expect(resolveSpaceContext({ spaceId })).resolves.toBe(spaceId);
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
      expect(navigationMocks.notFound).toHaveBeenCalledOnce();
    });

    it("signals not-found for missing or extra keys", async () => {
      await expect(resolveSpaceContext({})).rejects.toBeInstanceOf(
        NotFoundSignal,
      );
      await expect(
        resolveSpaceContext({
          spaceId: crypto.randomUUID(),
          extra: "key",
        }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
    });

    // React.cache is request-scoped; outside RSC we cannot assert promise
    // identity, only that concurrent callers still resolve correctly.
    it("resolves concurrent calls with the same params", async () => {
      const spaceId = crypto.randomUUID();
      const params = { spaceId };
      await expect(
        Promise.all([
          resolveSpaceContext(params),
          resolveSpaceContext(params),
        ]),
      ).resolves.toEqual([spaceId, spaceId]);
    });
  });

  describe("resolveCustomSectionContext", () => {
    it("returns both ids from awaited params", async () => {
      const spaceId = crypto.randomUUID();
      const sectionId = crypto.randomUUID();
      await expect(
        resolveCustomSectionContext({ spaceId, sectionId }),
      ).resolves.toEqual({ spaceId, sectionId });
    });

    it("accepts the params promise directly", async () => {
      const spaceId = crypto.randomUUID();
      const sectionId = crypto.randomUUID();
      await expect(
        resolveCustomSectionContext(Promise.resolve({ spaceId, sectionId })),
      ).resolves.toEqual({ spaceId, sectionId });
    });

    it("signals not-found for a malformed Space id", async () => {
      await expect(
        resolveCustomSectionContext({
          spaceId: "not-a-uuid",
          sectionId: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
    });

    it("signals not-found for a malformed Section id", async () => {
      await expect(
        resolveCustomSectionContext({
          spaceId: crypto.randomUUID(),
          sectionId: "not-a-uuid",
        }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
    });

    it("signals not-found for extra or missing keys", async () => {
      await expect(
        resolveCustomSectionContext({
          spaceId: crypto.randomUUID(),
          sectionId: crypto.randomUUID(),
          extra: "key",
        }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
      await expect(
        resolveCustomSectionContext({ spaceId: crypto.randomUUID() }),
      ).rejects.toBeInstanceOf(NotFoundSignal);
    });

    // React.cache is request-scoped; outside RSC we cannot assert promise
    // identity, only that concurrent callers still resolve correctly.
    it("resolves concurrent calls with the same params", async () => {
      const spaceId = crypto.randomUUID();
      const sectionId = crypto.randomUUID();
      const params = { spaceId, sectionId };
      await expect(
        Promise.all([
          resolveCustomSectionContext(params),
          resolveCustomSectionContext(params),
        ]),
      ).resolves.toEqual([
        { spaceId, sectionId },
        { spaceId, sectionId },
      ]);
    });
  });
});
