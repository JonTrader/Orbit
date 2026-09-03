import "../setup/api-mocks";
import "../setup/action-mocks";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineAction } from "@/lib/actions/framework";
import { DomainError } from "@/lib/domain-error";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
  guardRedirectsTo,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";

setTestDatabase({ marker: "test-db" });

const echoSchema = z
  .object({
    title: z.string().trim().min(1, "Title cannot be empty"),
  })
  .strict();

/** A minimal action over the shared frame: echoes what the runner provides. */
const echoAction = defineAction(
  echoSchema,
  async (parsed, ctx) => ({
    title: parsed.title,
    userId: ctx.userId,
    db: ctx.db,
  }),
);

const SPACE_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const spaceScopedAction = defineAction(
  z
    .object({
      spaceId: z.uuid(),
      title: z.string().trim().min(1, "Title cannot be empty"),
    })
    .strict(),
  async (parsed) => ({ title: parsed.title }),
);

const failingAction = defineAction(echoSchema, async () => {
  throw new Error("secret database DSN leaked");
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // The runner-level mocks are shared module state; every test starts clean.
  getRevalidatePathMock().mockClear();
  getRequireVerifiedSessionMock().mockReset();
});

describe("defineAction", () => {
  it("runs the handler with parsed input, the verified userId, and the db", async () => {
    authenticateAs("user-1");

    await expect(echoAction({ title: "  Water plants  " })).resolves.toEqual({
      ok: true,
      data: { title: "Water plants", userId: "user-1", db: { marker: "test-db" } },
    });
    expect(getRevalidatePathMock()).toHaveBeenCalledWith("/spaces", "layout");
  });

  it("revalidates the acting Space's layout when the schema carries spaceId", async () => {
    authenticateAs("user-1");

    const result = await spaceScopedAction({
      spaceId: SPACE_ID,
      title: "x",
    });
    expect(result.ok).toBe(true);
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      `/spaces/${SPACE_ID}`,
      "layout",
    );
    expect(getRevalidatePathMock()).not.toHaveBeenCalledWith(
      "/spaces",
      "layout",
    );
  });

  it("maps schema failures to VALIDATION_ERROR with issues", async () => {
    authenticateAs("user-1");

    const result = await echoAction({ title: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]).toMatchObject({ path: ["title"] });
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("passes DomainError codes and messages through untouched", async () => {
    authenticateAs("user-1");

    class FakeDomainError extends DomainError<"FAKE_CODE"> {
      readonly name = "FakeDomainError";
      constructor() {
        super("FAKE_CODE", "A known failure");
      }
    }

    const knownFailure = defineAction(echoSchema, async () => {
      throw new FakeDomainError();
    });

    const result = await knownFailure({ title: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "FAKE_CODE",
        message: "A known failure",
      });
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("masks unexpected errors as INTERNAL_ERROR without leaking details", async () => {
    authenticateAs("user-1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await failingAction({ title: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      });
      expect(JSON.stringify(result)).not.toContain("secret database DSN");
    }
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("propagates the session guard redirect instead of masking it", async () => {
    guardRedirectsTo("/verify-email");

    await expect(echoAction({ title: "x" })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
