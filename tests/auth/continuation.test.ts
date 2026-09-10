import { describe, expect, it } from "vitest";

import {
  ACCEPT_INVITE_PATH,
  APP_PATH,
  acceptInvitePath,
  authCallbackUrl,
  parseLocalContinuation,
  verifyEmailPath,
  withContinuation,
} from "@/lib/auth/paths";

describe("Invite auth continuation", () => {
  const invite = acceptInvitePath("secret-token");

  it("accepts a canonical accept-invite continuation and rebuilds it", () => {
    expect(parseLocalContinuation(invite)).toBe(invite);
    expect(
      parseLocalContinuation("/accept-invite?token=secret-token&utm=1"),
    ).toBe(invite);
  });

  it("rejects external, protocol-relative, and malformed targets", () => {
    expect(parseLocalContinuation("https://evil.test/accept-invite?token=x")).toBeNull();
    expect(parseLocalContinuation("//evil.test/accept-invite?token=x")).toBeNull();
    expect(parseLocalContinuation("/\\evil.test")).toBeNull();
    expect(parseLocalContinuation("/sign-in")).toBeNull();
    expect(parseLocalContinuation("/accept-invite")).toBeNull();
    expect(parseLocalContinuation("/accept-invite?token=")).toBeNull();
    expect(parseLocalContinuation(`${ACCEPT_INVITE_PATH}?token=${"a".repeat(257)}`)).toBeNull();
    expect(parseLocalContinuation(null)).toBeNull();
    expect(parseLocalContinuation("")).toBeNull();
  });

  it("routes callbacks through the app entry before returning to the Invite", () => {
    expect(authCallbackUrl(null)).toBe(APP_PATH);
    expect(authCallbackUrl(invite)).toBe(
      `${APP_PATH}?continue=${encodeURIComponent(invite)}`,
    );
    expect(withContinuation("/sign-in", invite)).toBe(
      `/sign-in?continue=${encodeURIComponent(invite)}`,
    );
    expect(verifyEmailPath("a@orbit.test", invite)).toBe(
      `/verify-email?email=${encodeURIComponent("a@orbit.test")}&continue=${encodeURIComponent(invite)}`,
    );
  });
});
