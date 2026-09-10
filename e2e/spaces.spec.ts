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
  directoryRow,
  runSuffix,
  signIn,
} from "./helpers";

/**
 * Spaces directory + create-Space UI: Browse all, membership-scoped rows,
 * filter, Open, in-place sidebar creation, and deep link on /spaces.
 * Also covers Space/Section rename and delete from the directory and
 * Section panel header.
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

    const personalRow = directoryRow(page, "Personal");
    await expect(personalRow).toHaveCount(1);
    await expect(
      personalRow.getByRole("heading", { name: "Personal", exact: true }),
    ).toBeVisible();
    await expect(personalRow.getByText(/Read-only/)).toBeVisible();
    await expect(personalRow.getByText(/2 Members/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Private ${runSuffix()}`, exact: true }),
    ).toHaveCount(0);
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
    const personalRow = directoryRow(page, "Personal");
    await expect(personalRow).toHaveCount(1);
    await expect(
      personalRow.getByRole("heading", { name: "Personal", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No matching Spaces")).toHaveCount(0);
  });

  test("Open navigates to that Space's Upcoming view", async ({ page }) => {
    await authenticate(page);
    await page.goto("/spaces");

    await directoryRow(page, "Personal")
      .getByRole("link", { name: "Open", exact: true })
      .click();
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
    await expect(
      directoryRow(page, name).getByRole("heading", { name, exact: true }),
    ).toBeVisible();
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

test.describe("Space and Section rename/delete", () => {
  async function createOwnedSpace(name: string): Promise<string> {
    const created = await ownerApi.post("/api/v1/spaces", { data: { name } });
    expect(created.status()).toBe(201);
    return ((await created.json()) as { id: string }).id;
  }

  async function createCustomSection(
    spaceId: string,
    name: string,
  ): Promise<string> {
    const created = await ownerApi.post(`/api/v1/spaces/${spaceId}/sections`, {
      data: { name, kind: "tasks" },
    });
    expect(created.status()).toBe(201);
    return ((await created.json()) as { id: string }).id;
  }

  test("renames a Space from the directory and shows the name in the Active Space header", async ({
    page,
  }) => {
    const original = `Rename Me ${runSuffix()}`;
    const renamed = `Renamed ${runSuffix()}`;
    const spaceId = await createOwnedSpace(original);

    await authenticate(page);
    await page.goto("/spaces");

    const row = directoryRow(page, original);
    await row.getByRole("button", { name: `Actions for ${original}` }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    const dialog = page.getByRole("dialog", { name: "Rename Space" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(dialog).toBeHidden();

    await expect(
      directoryRow(page, renamed).getByRole("heading", {
        name: renamed,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: original, exact: true }),
    ).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/upcoming`);
    await expect(page.getByText(`Active Space · ${renamed}`)).toBeVisible();
  });

  test("deletes a Space with typed-name confirm and removes the directory row", async ({
    page,
  }) => {
    const name = `Delete Me ${runSuffix()}`;
    await createOwnedSpace(name);

    await authenticate(page);
    await page.goto("/spaces");

    const row = directoryRow(page, name);
    await row.getByRole("button", { name: `Actions for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = page.getByRole("dialog", { name: "Delete Space" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(`Type "${name}" to confirm`).fill(name);
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toHaveCount(0);
  });

  test("Personal Space row has no overflow menu", async ({ page }) => {
    await authenticate(page);
    await page.goto("/spaces");

    const personalRow = directoryRow(page, "Personal");
    await expect(personalRow).toHaveCount(1);
    await expect(
      personalRow.getByRole("heading", { name: "Personal", exact: true }),
    ).toBeVisible();
    await expect(
      personalRow.getByRole("button", { name: "Actions for Personal" }),
    ).toHaveCount(0);
  });

  test("renames a custom Section; tab label and meta bar update", async ({
    page,
  }) => {
    const spaceName = `Section Host ${runSuffix()}`;
    const original = `Errands ${runSuffix()}`;
    const renamed = `Renamed Errands ${runSuffix()}`;
    const spaceId = await createOwnedSpace(spaceName);
    const sectionId = await createCustomSection(spaceId, original);

    await authenticate(page);
    await page.goto(`/spaces/${spaceId}/${sectionId}`);
    await expect(
      page.getByRole("heading", { name: original, exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: `Actions for ${original}` })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    const dialog = page.getByRole("dialog", { name: "Rename Section" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByRole("button", { name: "Rename" }).click();
    await expect(dialog).toBeHidden();

    await expect(
      page.getByRole("tablist", { name: "Sections" }).getByRole("tab", {
        name: renamed,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: renamed, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(new RegExp(`^${renamed} ·`))).toBeVisible();
  });

  test("deletes a custom Section and redirects to Upcoming", async ({
    page,
  }) => {
    const spaceName = `Delete Section Host ${runSuffix()}`;
    const sectionName = `Temp Section ${runSuffix()}`;
    const spaceId = await createOwnedSpace(spaceName);
    const sectionId = await createCustomSection(spaceId, sectionName);

    await authenticate(page);
    await page.goto(`/spaces/${spaceId}/${sectionId}`);

    await page
      .getByRole("button", { name: `Actions for ${sectionName}` })
      .click();
    await page.getByRole("menuitem", { name: "Delete Section" }).click();

    const dialog = page.getByRole("dialog", { name: "Delete Section" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();

    await expect(page).toHaveURL(new RegExp(`/spaces/${spaceId}/upcoming$`));
    await expect(
      page.getByRole("heading", { name: "Upcoming", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tablist", { name: "Sections" }).getByRole("tab", {
        name: sectionName,
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("Daily and Monthlies have no Section overflow menu", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto(`/spaces/${personalSpaceId}/daily`);
    await expect(
      page.getByRole("heading", { name: "Daily", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions for Daily" }),
    ).toHaveCount(0);

    await page.goto(`/spaces/${personalSpaceId}/monthlies`);
    await expect(
      page.getByRole("heading", { name: "Monthlies", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions for Monthlies" }),
    ).toHaveCount(0);
  });

  test("read-only Viewer sees no Section overflow menu", async ({
    page,
    request,
  }) => {
    const spaceName = `Viewer Host ${runSuffix()}`;
    const sectionName = `Viewer Section ${runSuffix()}`;
    const spaceId = await createOwnedSpace(spaceName);
    const sectionId = await createCustomSection(spaceId, sectionName);

    const member = await createVerifiedUser(request, "Rename Delete Viewer");
    const memberSession = await signIn(request, member);
    await addMemberReadOnly(
      request,
      ownerSession,
      spaceId,
      member,
      memberSession,
    );

    await authenticatePage(page, memberSession);
    await page.goto(`/spaces/${spaceId}/${sectionId}`);
    await expect(
      page.getByRole("heading", { name: sectionName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Actions for ${sectionName}` }),
    ).toHaveCount(0);
  });
});
