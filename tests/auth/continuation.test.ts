import { describe, expect, it } from "vitest";

import {
  ACCEPT_INVITE_PATH,
  APP_PATH,
  CONTINUATION_PARAM,
  authCallbackUrl,
  continuationFromSearchParams,
  parseLocalContinuation,
  verifyEmailPath,
  withContinuation,
} from "@/lib/auth/paths";

describe("Invite auth continuation", () => {
  const invite = ACCEPT_INVITE_PATH;

  it("accepts bare accept-invite and canonicalizes legacy tokenful continue", () => {
    expect(parseLocalContinuation(invite)).toBe(ACCEPT_INVITE_PATH);
    expect(parseLocalContinuation("/accept-invite?token=secret-token")).toBe(
      ACCEPT_INVITE_PATH,
    );
    expect(
      parseLocalContinuation("/accept-invite?token=secret-token&utm=1"),
    ).toBe(ACCEPT_INVITE_PATH);
  });

  it("rejects external, protocol-relative, and malformed targets", () => {
    expect(parseLocalContinuation("https://evil.test/accept-invite?token=x")).toBeNull();
    expect(parseLocalContinuation("//evil.test/accept-invite?token=x")).toBeNull();
    expect(parseLocalContinuation("/\\evil.test")).toBeNull();
    expect(parseLocalContinuation("/sign-in")).toBeNull();
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
    expect(withContinuation("/sign-up", invite)).toBe(
      `/sign-up?continue=${encodeURIComponent(invite)}`,
    );
    expect(withContinuation("/sign-in", null)).toBe("/sign-in");
    expect(verifyEmailPath("a@orbit.test", invite)).toBe(
      `/verify-email?email=${encodeURIComponent("a@orbit.test")}&continue=${encodeURIComponent(invite)}`,
    );
    expect(verifyEmailPath("a@orbit.test")).toBe(
      `/verify-email?email=${encodeURIComponent("a@orbit.test")}`,
    );
    expect(verifyEmailPath(undefined, invite)).toBe(
      `/verify-email?continue=${encodeURIComponent(invite)}`,
    );
  });

  it("unwraps searchParams continue as string, string[], or undefined", () => {
    expect(
      continuationFromSearchParams({ [CONTINUATION_PARAM]: invite }),
    ).toBe(invite);
    expect(
      continuationFromSearchParams({ [CONTINUATION_PARAM]: [invite] }),
    ).toBe(invite);
    expect(
      continuationFromSearchParams({
        [CONTINUATION_PARAM]: [invite, "/sign-in"],
      }),
    ).toBe(invite);
    expect(continuationFromSearchParams({})).toBeNull();
    expect(
      continuationFromSearchParams({ [CONTINUATION_PARAM]: undefined }),
    ).toBeNull();
  });

  it("still rejects open redirects after unwrapping searchParams", () => {
    expect(
      continuationFromSearchParams({
        [CONTINUATION_PARAM]: "https://evil.test/accept-invite?token=x",
      }),
    ).toBeNull();
    expect(
      continuationFromSearchParams({
        [CONTINUATION_PARAM]: ["//evil.test/accept-invite?token=x"],
      }),
    ).toBeNull();
    expect(
      continuationFromSearchParams({ [CONTINUATION_PARAM]: "/sign-in" }),
    ).toBeNull();
  });
});
