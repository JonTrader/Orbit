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
  spaceMembers,
} from "./helpers";

/**
 * Assignee picker E2E: edit-form set/clear on Daily, Monthlies compose +
 * Upcoming label, and Read-only Viewer chrome. Owner mutates; a Read-only
 * Member is the Assignee target (and the Viewer in the last case).
 */

let ownerApi: APIRequestContext;
let ownerSession: string;
let personalSpaceId: string;
let member: { email: string; password: string; name: string };
let memberSession: string;
let memberUserId: string;

test.beforeAll(async ({ request }) => {
  const owner = await createVerifiedUser(request, "E2E Assignee Owner");
  ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });

  await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
  });

  const spaces = await ownerApi.get("/api/v1/spaces");
  const list = (await spaces.json()) as Array<{ id: string }>;
  personalSpaceId = list[0]!.id;

  member = await createVerifiedUser(request, "E2E Assignee Viewer");
  memberSession = await signIn(request, member);
  await addMemberReadOnly(
    request,
    ownerSession,
    personalSpaceId,
    member,
    memberSession,
  );

  const members = await spaceMembers(request, ownerSession, personalSpaceId);
  const row = members.find((m) => m.name === member.name);
  if (!row) throw new Error(`Member ${member.name} missing from Space`);
  memberUserId = row.userId;
});

test.afterAll(async () => {
  await closeDb();
});

async function dailySectionId(): Promise<string> {
  const response = await ownerApi.get(
    `/api/v1/spaces/${personalSpaceId}/sections`,
  );
  const sections = (await response.json()) as Array<{
    id: string;
    kind: string;
  }>;
  const daily = sections.find((row) => row.kind === "daily");
  if (!daily) throw new Error("No Daily section");
  return daily.id;
}

async function openRowEdit(page: Page, title: string): Promise<void> {
  const actions = page.getByRole("button", { name: `Actions for ${title}` });
  await actions.scrollIntoViewIfNeeded();
  await actions.click();
  const menu = page.getByRole("menu", { name: `Actions for ${title}` });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("form", { name: `Edit ${title}` })).toBeVisible();
}

/** Innermost matching div - outer ancestors also wrap ComposeBar options. */
function taskRow(page: Page, title: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({
      has: page.getByRole("checkbox", { name: `Complete ${title}` }),
    })
    .last();
}

function monthlyRow(page: Page, title: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({
      has: page.getByRole("button", {
        name: `Mark ${title} done for this period`,
      }),
    })
    .last();
}

/** exact: true - share-bar avatars include "Assignee" in their names. */
function assigneeSelect(scope: Page | Locator) {
  return scope.getByRole("combobox", { name: "Assignee", exact: true });
}

test.describe("Assignee", () => {
  test("Daily edit form assigns a Read-only Member", async ({ page }) => {
    await authenticatePage(page, ownerSession);

    const title = `E2E assign ${runSuffix()}`;
    const daily = await dailySectionId();
    const created = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/tasks`,
      { data: { sectionId: daily, title } },
    );
    expect(created.status()).toBe(201);

    await page.goto(`/spaces/${personalSpaceId}/daily`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await openRowEdit(page, title);
    const editForm = page.getByRole("form", { name: `Edit ${title}` });
    await assigneeSelect(editForm).selectOption({ label: member.name });
    await editForm.getByRole("button", { name: "Save" }).click();

    await expect(
      taskRow(page, title).getByText(member.name, { exact: true }),
    ).toBeVisible();
  });

  test("Daily edit form clears the Assignee", async ({ page }) => {
    await authenticatePage(page, ownerSession);

    const title = `E2E clear assign ${runSuffix()}`;
    const daily = await dailySectionId();
    const created = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/tasks`,
      {
        data: {
          sectionId: daily,
          title,
          assigneeId: memberUserId,
        },
      },
    );
    expect(created.status()).toBe(201);

    await page.goto(`/spaces/${personalSpaceId}/daily`);
    await expect(
      taskRow(page, title).getByText(member.name, { exact: true }),
    ).toBeVisible();

    await openRowEdit(page, title);
    const editForm = page.getByRole("form", { name: `Edit ${title}` });
    await assigneeSelect(editForm).selectOption({ label: "Unassigned" });
    await editForm.getByRole("button", { name: "Save" }).click();

    await expect(
      taskRow(page, title).getByText(member.name, { exact: true }),
    ).toHaveCount(0);
  });

  test("Monthlies compose Assignee appears on row and Upcoming", async ({
    page,
  }) => {
    await authenticatePage(page, ownerSession);

    const title = `E2E monthly assign ${runSuffix()}`;
    await page.goto(`/spaces/${personalSpaceId}/monthlies`);

    await page.getByLabel("Add to Monthlies").fill(title);
    await page.getByLabel("Due day of month").fill("18");
    await assigneeSelect(page).selectOption({ label: member.name });
    await page.getByLabel("Add to Monthlies").press("Enter");

    await expect(
      monthlyRow(page, title).getByText(member.name, { exact: true }),
    ).toBeVisible();

    await page.goto(`/spaces/${personalSpaceId}/upcoming`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const entry = page
      .locator("div.flex.items-start")
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(entry).toContainText(member.name);
  });

  test("Read-only Viewer sees Assignee and cannot edit", async ({ page }) => {
    const title = `E2E viewer assign ${runSuffix()}`;
    const daily = await dailySectionId();
    const created = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/tasks`,
      {
        data: {
          sectionId: daily,
          title,
          assigneeId: memberUserId,
        },
      },
    );
    expect(created.status()).toBe(201);

    await authenticatePage(page, memberSession);
    await page.goto(`/spaces/${personalSpaceId}/daily`);

    // Read-only rows have no checkbox role - scope by title + Assignee name.
    await expect(
      page
        .locator("div")
        .filter({ has: page.getByText(title, { exact: true }) })
        .filter({ has: page.getByText(member.name, { exact: true }) })
        .last(),
    ).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Actions for ${title}` }),
    ).toHaveCount(0);
  });
});
