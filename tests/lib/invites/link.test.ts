import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { ACCEPT_INVITE_PATH } from "@/lib/auth/paths";
import {
  INVITE_BEARER_MAX_LENGTH,
  inviteBearer,
  inviteEmailArrival,
} from "@/lib/invites/link";
import { PENDING_INVITE_COOKIE } from "@/lib/invites/pending-cookie";
import { proxy } from "@/proxy";

describe("Invite link", () => {
  it("accepts a bearer at the length cap and rejects anything longer", () => {
    const capped = "a".repeat(INVITE_BEARER_MAX_LENGTH);
    expect(inviteBearer(capped)).toBe(capped);
    expect(inviteBearer(`${capped}a`)).toBeNull();
    expect(inviteBearer("")).toBeNull();
    expect(inviteBearer(null)).toBeNull();
  });

  it("leaves a request with no token on the URL", () => {
    expect(inviteEmailArrival(null)).toEqual({ strip: false });
  });

  it("strips a legal bearer so the proxy can stash it", () => {
    expect(inviteEmailArrival("secret-token")).toEqual({
      strip: true,
      bearer: "secret-token",
    });
  });

  it("strips an illegal bearer without a value to stash", () => {
    expect(inviteEmailArrival("")).toEqual({ strip: true, bearer: null });
    expect(inviteEmailArrival("a".repeat(INVITE_BEARER_MAX_LENGTH + 1))).toEqual({
      strip: true,
      bearer: null,
    });
  });
});

describe("Invite email-link proxy", () => {
  function arrive(search: string) {
    return proxy(
      new NextRequest(`http://localhost${ACCEPT_INVITE_PATH}${search}`),
    );
  }

  it("stashes a legal bearer and redirects to the bare path", () => {
    const response = arrive("?token=secret-token");
    expect(response.headers.get("location")).toBe(
      `http://localhost${ACCEPT_INVITE_PATH}`,
    );
    expect(response.cookies.get(PENDING_INVITE_COOKIE)?.value).toBe(
      "secret-token",
    );
  });

  it("strips an over-long bearer and does not store it", () => {
    const response = arrive(
      `?token=${"a".repeat(INVITE_BEARER_MAX_LENGTH + 1)}`,
    );
    expect(response.headers.get("location")).toBe(
      `http://localhost${ACCEPT_INVITE_PATH}`,
    );
    expect(response.cookies.get(PENDING_INVITE_COOKIE)).toBeUndefined();
  });

  it("passes through when the email link has no token", () => {
    const response = arrive("");
    expect(response.headers.get("location")).toBeNull();
  });
});
