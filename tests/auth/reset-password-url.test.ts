import { describe, expect, it } from "vitest";

import { resetPasswordFragmentUrl } from "@/lib/auth/paths";

describe("reset password URL", () => {
  it("moves a Better Auth path token into a fragment", () => {
    const result = resetPasswordFragmentUrl(
      "http://localhost:3000/api/auth/reset-password/abc123?callbackURL=%2Freset-password",
    );
    const url = new URL(result);

    expect(url.pathname).toBe("/reset-password");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#token=abc123");
  });

  it("encodes token characters inside the fragment", () => {
    const result = resetPasswordFragmentUrl(
      "https://orbit.test/api/auth/reset-password/a%2Bb%3D",
    );

    expect(new URL(result).hash).toBe("#token=a%2Bb%3D");
  });

  it("rejects a URL without a reset token", () => {
    expect(() =>
      resetPasswordFragmentUrl("http://localhost:3000/reset-password"),
    ).toThrow("Reset URL does not contain a token");
  });
});
