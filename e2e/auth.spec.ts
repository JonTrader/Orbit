import { expect, test } from "@playwright/test";

import { closeDb, createVerifiedUser } from "./helpers";

test.afterAll(async () => {
  await closeDb();
});

test("sign-in opens the entry Space while / remains the landing page", async ({
  page,
  request,
}) => {
  const user = await createVerifiedUser(request, "Sign In Redirect");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/spaces\/[^/]+\/upcoming$/);
  await expect(
    page.getByRole("heading", { name: "Upcoming", exact: true }),
  ).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", {
      name: /Stop treating rent like a grocery list/,
    }),
  ).toBeVisible();
});
