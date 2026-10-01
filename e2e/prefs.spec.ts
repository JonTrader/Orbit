import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  addMemberReadOnly,
  authenticatePage,
  closeDb,
  cookieHeader,
  createVerifiedUser,
  runSuffix,
  signIn,
} from "./helpers";

/**
 * Reminder preference E2E. Days-before and email paint from the
 * Active Space layout. Playwright clears Resend; this spec does not assert
 * delivery.
 */

let ownerApi: APIRequestContext;
let ownerSession: string;

test.beforeAll(async ({ request }) => {
  const owner = await createVerifiedUser(request, "Prefs Owner");
  ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });
  // Onboarding runs in the web app: /spaces ensures the Personal Space.
  const onboard = await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
    maxRedirects: 5,
  });
  expect(onboard.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await closeDb();
});

async function createOwnedSpace(name: string): Promise<string> {
  const created = await ownerApi.post("/api/v1/spaces", {
    data: { name },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).id as string;
}

async function openUpcoming(
  page: Page,
  session: string,
  spaceId: string,
): Promise<void> {
  await page.context().clearCookies();
  await authenticatePage(page, session);
  await page.goto(`/spaces/${spaceId}/upcoming`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function openReminders(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Reminders" }).click();
  const dialog = page.getByRole("dialog", { name: "Reminders" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Visible pill is the label; the radio itself is visually hidden. */
async function chooseEmail(dialog: Locator, email: "On" | "Off"): Promise<void> {
  await dialog.getByText(email, { exact: true }).click();
}

async function expectPrefs(
  dialog: Locator,
  days: string,
  email: "On" | "Off",
): Promise<void> {
  await expect(dialog.locator("#reminder-days")).toHaveValue(days);
  await expect(dialog.getByRole("radio", { name: email })).toBeChecked();
}

test.describe("Reminder preferences", () => {
  test("saves days-before and email off; reload and a second Space keep their own values", async ({
    page,
  }) => {
    const spaceId = await createOwnedSpace(`Prefs Save ${runSuffix()}`);
    const otherSpaceId = await createOwnedSpace(`Prefs Other ${runSuffix()}`);

    await openUpcoming(page, ownerSession, spaceId);
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();

    const dialog = await openReminders(page);
    await expectPrefs(dialog, "3", "On");
    await dialog.locator("#reminder-days").fill("5");
    await chooseEmail(dialog, "Off");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectPrefs(await openReminders(page), "5", "Off");

    await openUpcoming(page, ownerSession, otherSpaceId);
    await expectPrefs(await openReminders(page), "3", "On");

    await openUpcoming(page, ownerSession, spaceId);
    await expectPrefs(await openReminders(page), "5", "Off");
  });

  test("read-only Member saves their own days-before without changing the Owner", async ({
    page,
    request,
  }) => {
    const spaceId = await createOwnedSpace(`Prefs Reader ${runSuffix()}`);
    const member = await createVerifiedUser(request, "Prefs Reader");
    const memberSession = await signIn(request, member);
    const onboard = await request.get("/spaces", {
      headers: { cookie: cookieHeader(memberSession) },
      maxRedirects: 5,
    });
    expect(onboard.ok()).toBeTruthy();
    await addMemberReadOnly(
      request,
      ownerSession,
      spaceId,
      member,
      memberSession,
    );

    await openUpcoming(page, memberSession, spaceId);
    await expect(page.getByRole("button", { name: "Reminders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);

    const dialog = await openReminders(page);
    await expectPrefs(dialog, "3", "On");
    await dialog.locator("#reminder-days").fill("7");
    await chooseEmail(dialog, "Off");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectPrefs(await openReminders(page), "7", "Off");

    await openUpcoming(page, ownerSession, spaceId);
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    await expectPrefs(await openReminders(page), "3", "On");
  });
});
