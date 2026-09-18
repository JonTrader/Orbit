import { expect, test } from "@playwright/test";

import {
  authenticatePage,
  closeDb,
  createVerifiedUser,
  markEmailUnverified,
  runSuffix,
  signIn,
} from "./helpers";

/**
 * Marketing `/` Invite continuation wiring: guest CTAs and unverified redirect
 * must preserve a validated bare `/accept-invite` continue (bearer lives in
 * the HttpOnly pending cookie, not in continue / callbackURL).
 */

const CONTINUATION = "/accept-invite";

test.afterAll(async () => {
  await closeDb();
});

function continueFromHref(href: string | null): string | null {
  if (!href) return null;
  return new URL(href, "http://localhost:3000").searchParams.get("continue");
}

test.describe("Landing Invite continue", () => {
  test("guest CTAs keep continue on Sign Up and Sign in", async ({ page }) => {
    await page.goto(`/?continue=${encodeURIComponent(CONTINUATION)}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const signUpLinks = page.getByRole("link", { name: "Sign Up" });
    await expect(signUpLinks.first()).toBeVisible();
    const signUpCount = await signUpLinks.count();
    expect(signUpCount).toBeGreaterThan(0);
    for (let i = 0; i < signUpCount; i += 1) {
      expect(continueFromHref(await signUpLinks.nth(i).getAttribute("href"))).toBe(
        CONTINUATION,
      );
    }

    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    expect(continueFromHref(await signIn.getAttribute("href"))).toBe(
      CONTINUATION,
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

    await authenticatePage(page, session);
    await page.goto(`/?continue=${encodeURIComponent(CONTINUATION)}`);

    await expect(page).toHaveURL(/\/verify-email/);
    const url = new URL(page.url());
    expect(url.searchParams.get("continue")).toBe(CONTINUATION);
    expect(url.searchParams.get("email")).toBe(user.email);
    await expect(
      page.getByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();
  });
});
