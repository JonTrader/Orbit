import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../setup/api-mocks";
import { getSessionMock } from "../../setup/api-mocks";

import { requireApiSession } from "@/lib/rest-api/auth";
import { ApiError } from "@/lib/rest-api/errors";

describe("requireApiSession", () => {
  beforeEach(() => {
    getSessionMock().mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getSessionMock().mockResolvedValue(null);

    await expect(requireApiSession(new Request("http://localhost/api"))).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authentication is required",
    } satisfies Partial<ApiError>);
  });

  it("returns 401 when email is not verified", async () => {
    getSessionMock().mockResolvedValue({
      user: { id: "u_1", emailVerified: false },
      session: { id: "s_1" },
    });

    await expect(requireApiSession(new Request("http://localhost/api"))).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Email verification is required",
    } satisfies Partial<ApiError>);
  });

  it("returns the session when the user is verified", async () => {
    const session = {
      user: { id: "u_1", emailVerified: true, name: "Maya", email: "m@orbit.test" },
      session: { id: "s_1" },
    };
    getSessionMock().mockResolvedValue(session);

    await expect(requireApiSession(new Request("http://localhost/api"))).resolves.toBe(
      session,
    );
  });
});
