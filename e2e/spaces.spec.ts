import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
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
 * Spaces directory + create-Space UI: Browse all, membership-scoped rows,
 * filter, Open, in-place sidebar creation, and deep link on /spaces.
 */

let ownerApi: APIRequestContext;
let owner: { email: string; password: string; name: string };
let ownerSession: string;
let personalSpaceId: string;

test.beforeAll(async ({ request }) => {
  owner = await createVerifiedUser(request, "Spaces Owner");
  ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });

  await request.get("/", { headers: { cookie: cookieHeader(ownerSession) } });

  const spaces = await ownerApi.get("/api/v1/spaces");
  const list = (await spaces.json()) as Array<{ id: string; name: string }>;
  personalSpaceId = list[0].id;
});

test.afterAll(async () => {
  await closeDb();
});

function spacesSidebar(page: Page) {
  return page.getByRole("complementary", { name: "Spaces" });
}

async function authenticate(page: Page): Promise<void> {
  await authenticatePage(page, ownerSession);
  await page.goto(`/spaces/${personalSpaceId}/upcoming`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(spacesSidebar(page)).toBeVisible();
}

test.describe("Spaces directory and creation", () => {
  test("Browse all Spaces opens the directory", async ({ page }) => {
    await authenticate(page);

    await spacesSidebar(page).getByRole("link", { name: "Browse all Spaces" }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await expect(
      page.getByRole("heading", { name: "Spaces", exact: true }),
    ).toBeVisible();
  });

  test("directory lists membership Spaces with role and Member metadata", async ({
    page,
    request,
  }) => {
    const outsider = await createVerifiedUser(request, "Spaces Outsider");
    const outsiderSession = await signIn(request, outsider);
    const outsiderApi = await playwrightRequest.newContext({
      extraHTTPHeaders: { cookie: cookieHeader(outsiderSession) },
    });
    await request.get("/", {
      headers: { cookie: cookieHeader(outsiderSession) },
    });
    await outsiderApi.post("/api/v1/spaces", {
      data: { name: `Private ${runSuffix()}` },
    });

    const member = await createVerifiedUser(request, "Spaces Member");
    const memberSession = await signIn(request, member);
    await addMemberReadOnly(
      request,
      ownerSession,
      personalSpaceId,
      member,
      memberSession,
    );

    await authenticatePage(page, memberSession);
    await page.goto("/spaces");

    await expect(page.getByText("Personal")).toBeVisible();
    await expect(page.getByText(/Read-only/)).toBeVisible();
    await expect(page.getByText(/2 Members/)).toBeVisible();
    await expect(page.getByText(`Private ${runSuffix()}`)).toHaveCount(0);
  });

  test("filter updates the visible count and shows a no-match state", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto("/spaces");

    const filter = page.getByPlaceholder("Filter by name");
    await filter.fill("zzzz-no-match");
    await expect(page.getByText(/0 of \d+ Spaces?/)).toBeVisible();
    await expect(page.getByText("No matching Spaces")).toBeVisible();

    await filter.fill("Personal");
    await expect(page.getByText("Personal")).toBeVisible();
    await expect(page.getByText("No matching Spaces")).toHaveCount(0);
  });

  test("Open navigates to that Space's Upcoming view", async ({ page }) => {
    await authenticate(page);
    await page.goto("/spaces");

    await page.getByRole("link", { name: "Open", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${personalSpaceId}/upcoming`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("sidebar New Space creates in place and opens Upcoming", async ({
    page,
  }) => {
    await authenticate(page);

    const zone = "America/Denver";
    await page.context().addCookies([
      {
        name: "orbit_tz",
        value: zone,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);

    const name = `Created ${runSuffix()}`;
    await spacesSidebar(page).getByRole("button", { name: "New Space" }).click();

    const dialog = page.getByRole("dialog", { name: "New Space" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Create Space" }).click();

    await expect(page).toHaveURL(/\/spaces\/[^/]+\/upcoming$/);
    await expect(
      page.getByRole("heading", { name: "Upcoming", exact: true }),
    ).toBeVisible();

    await expect(
      spacesSidebar(page).getByRole("link", { name, exact: true }),
    ).toBeVisible();

    const createdUrl = page.url();
    const createdSpaceId = createdUrl.match(/\/spaces\/([^/]+)\//)?.[1];
    expect(createdSpaceId).toBeTruthy();

    await page.goto(`/spaces/${createdSpaceId}/daily`);
    await expect(page.getByRole("heading", { name: "Daily", exact: true })).toBeVisible();
    await page.goto(`/spaces/${createdSpaceId}/monthlies`);
    await expect(
      page.getByRole("heading", { name: "Monthlies", exact: true }),
    ).toBeVisible();

    const spaces = await ownerApi.get("/api/v1/spaces");
    const list = (await spaces.json()) as Array<{
      id: string;
      name: string;
      timezone: string;
    }>;
    const created = list.find((row) => row.name === name);
    expect(created?.timezone).toBe(zone);

    await page.goto("/spaces");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("unauthenticated /spaces redirects to sign-in", async ({ page }) => {
    await page.goto("/spaces");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("mobile: Browse all Spaces reaches the directory", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await authenticate(page);

    await page.getByRole("button", { name: "Open spaces" }).click();
    await spacesSidebar(page).getByRole("link", { name: "Browse all Spaces" }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await expect(
      page.getByRole("heading", { name: "Spaces", exact: true }),
    ).toBeVisible();
  });
});
