import { expect, test } from "@playwright/test";

import {
  acceptInviteUrl,
  authenticatePage,
  closeDb,
  createVerifiedUser,
  markEmailUnverified,
  newInviteBearerToken,
  runSuffix,
  signIn,
} from "./helpers";

/**
 * Marketing `/` Invite continuation wiring: guest CTAs and unverified redirect
 * must preserve a validated `continue` query (Step 1 landing review fix).
 */

test.afterAll(async () => {
  await closeDb();
});

function continueFromHref(href: string | null): string | null {
  if (!href) return null;
  return new URL(href, "http://localhost:3000").searchParams.get("continue");
}

test.describe("Landing Invite continue", () => {
  test("guest CTAs keep continue on Sign Up and Sign in", async ({ page }) => {
    const continuation = acceptInviteUrl(newInviteBearerToken());

    await page.goto(`/?continue=${encodeURIComponent(continuation)}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const signUpLinks = page.getByRole("link", { name: "Sign Up" });
    await expect(signUpLinks.first()).toBeVisible();
    const signUpCount = await signUpLinks.count();
    expect(signUpCount).toBeGreaterThan(0);
    for (let i = 0; i < signUpCount; i += 1) {
      expect(continueFromHref(await signUpLinks.nth(i).getAttribute("href"))).toBe(
        continuation,
      );
    }

    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    expect(continueFromHref(await signIn.getAttribute("href"))).toBe(
      continuation,
    );
  });

  test("unverified session on / redirects to verify-email with continue", async ({
    page,
    request,
  }) => {
    const user = await createVerifiedUser(
      request,
      `Landing Unverified ${runSuffix()}`,
    );
    const session = await signIn(request, user);
    await markEmailUnverified(user.email);

    const continuation = acceptInviteUrl(newInviteBearerToken());
    await authenticatePage(page, session);
    await page.goto(`/?continue=${encodeURIComponent(continuation)}`);

    await expect(page).toHaveURL(/\/verify-email/);
    const url = new URL(page.url());
    expect(url.searchParams.get("continue")).toBe(continuation);
    expect(url.searchParams.get("email")).toBe(user.email);
    await expect(
      page.getByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
  });
});
