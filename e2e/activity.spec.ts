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
 * Activity E2E: Task History, Monthly completion history, ShareBar Activity
 * scoped to the Active Space, and a deleted Task that remains in Activity.
 * Setup goes through the API. The behavior under test goes through the browser.
 * A Read-only Member can open History and Activity. Edit and Move stay off
 * that Member's row menu.
 */

let ownerApi: APIRequestContext;
let ownerName: string;
let editorName: string;
let editorSession: string;
let viewerSession: string;
let spaceId: string;
let spaceName: string;
let dailyId: string;
let secondSpaceId: string;
let secondSpaceName: string;
let secondDailyId: string;

const moveTargetName = `Activity tasks ${runSuffix()}`;

test.beforeAll(async ({ request }) => {
  const owner = await createVerifiedUser(request, "E2E Activity Owner");
  ownerName = owner.name;
  const ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });

  await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
  });
  const spaces = await ownerApi.get("/api/v1/spaces");
  expect(spaces.status()).toBe(200);
  const list = (await spaces.json()) as Array<{ id: string; name: string }>;
  spaceId = list[0]!.id;
  spaceName = list[0]!.name;

  const editor = await createVerifiedUser(request, "E2E Activity Editor");
  editorName = editor.name;
  editorSession = await signIn(request, editor);
  await addMemberReadOnly(
    request,
    ownerSession,
    spaceId,
    editor,
    editorSession,
    "editor",
  );

  const viewer = await createVerifiedUser(request, "E2E Activity Viewer");
  viewerSession = await signIn(request, viewer);
  await addMemberReadOnly(
    request,
    ownerSession,
    spaceId,
    viewer,
    viewerSession,
  );

  secondSpaceName = `Activity other ${runSuffix()}`;
  const created = await ownerApi.post("/api/v1/spaces", {
    data: { name: secondSpaceName },
  });
  expect(created.status()).toBe(201);
  secondSpaceId = ((await created.json()) as { id: string }).id;
  await addMemberReadOnly(
    request,
    ownerSession,
    secondSpaceId,
    viewer,
    viewerSession,
  );

  dailyId = await sectionIdByKind(spaceId, "daily");
  secondDailyId = await sectionIdByKind(secondSpaceId, "daily");

  // A second tasks Section gives Daily a legal Move destination, so the
  // Editor menu includes Move and the Read-only menu can be checked against it.
  const tasksSection = await ownerApi.post(`/api/v1/spaces/${spaceId}/sections`, {
    data: { name: moveTargetName, kind: "tasks" },
  });
  expect(tasksSection.status()).toBe(201);
});

test.afterAll(async () => {
  await ownerApi.dispose();
  await closeDb();
});

async function sectionIdByKind(
  targetSpaceId: string,
  kind: string,
): Promise<string> {
  const response = await ownerApi.get(
    `/api/v1/spaces/${targetSpaceId}/sections`,
  );
  expect(response.status()).toBe(200);
  const sections = (await response.json()) as Array<{
    id: string;
    kind: string;
  }>;
  const match = sections.find((row) => row.kind === kind);
  if (!match) throw new Error(`No ${kind} section in ${targetSpaceId}`);
  return match.id;
}

async function useSession(page: Page, sessionCookie: string): Promise<void> {
  await page.context().clearCookies();
  await authenticatePage(page, sessionCookie);
}

function spacesSidebar(page: Page) {
  return page.getByRole("complementary", { name: "Spaces" });
}

function monthlyRow(page: Page, title: string): Locator {
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

async function duePeriod(row: Locator): Promise<string> {
  const text = ((await row.getByText(/^due /).textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const period = text.replace(/^due\s+/i, "").trim();
  if (!period) throw new Error(`Missing due period in "${text}"`);
  return period;
}

async function openRowMenu(page: Page, title: string): Promise<Locator> {
  const actions = page.getByRole("button", { name: `Actions for ${title}` });
  await actions.scrollIntoViewIfNeeded();
  await actions.click();
  const menu = page.getByRole("menu", { name: `Actions for ${title}` });
  await expect(menu).toBeVisible();
  return menu;
}

async function openHistory(page: Page, title: string): Promise<Locator> {
  const menu = await openRowMenu(page, title);
  await menu.getByRole("menuitem", { name: "History", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "History" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("list", { name: "History" })).toBeVisible();
  return dialog;
}

async function openActivity(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Activity", exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Activity" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("list", { name: "Activity" })).toBeVisible();
  return dialog;
}

async function showCompleted(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: /Show completed/ }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test.describe("Activity", () => {
  test("Editor Daily Task History shows created and completed; Read-only sees the same lines and no Edit or Move", async ({
    page,
  }) => {
    await useSession(page, editorSession);
    await page.goto(`/spaces/${spaceId}/daily`);

    const title = `Activity daily ${runSuffix()}`;
    await page.getByLabel("Add to Daily").fill(title);
    await page.getByLabel("Add to Daily").press("Enter");
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: `Complete ${title}` }).click();
    await expect(page.getByText(title, { exact: true })).toBeHidden();
    await showCompleted(page, title);

    const editorMenu = await openRowMenu(page, title);
    for (const name of ["Edit", "Move", "History", "Delete"]) {
      await expect(
        editorMenu.getByRole("menuitem", { name, exact: true }),
      ).toBeVisible();
    }
    await editorMenu
      .getByRole("menuitem", { name: "History", exact: true })
      .click();
    const editorHistory = page.getByRole("dialog", { name: "History" });
    await expect(editorHistory).toBeVisible();
    const editorLines = editorHistory.getByRole("listitem");
    await expect(editorLines.nth(0)).toContainText(
      `${editorName} completed ${title}`,
    );
    await expect(editorLines.nth(1)).toContainText(
      `${editorName} created ${title}`,
    );

    await useSession(page, viewerSession);
    await page.goto(`/spaces/${spaceId}/daily`);
    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await showCompleted(page, title);

    const viewerMenu = await openRowMenu(page, title);
    await expect(
      viewerMenu.getByRole("menuitem", { name: "History", exact: true }),
    ).toBeVisible();
    await expect(
      viewerMenu.getByRole("menuitem", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(
      viewerMenu.getByRole("menuitem", { name: "Move", exact: true }),
    ).toHaveCount(0);
    await viewerMenu
      .getByRole("menuitem", { name: "History", exact: true })
      .click();

    const viewerHistory = page.getByRole("dialog", { name: "History" });
    await expect(viewerHistory).toBeVisible();
    const viewerLines = viewerHistory.getByRole("listitem");
    await expect(viewerLines.nth(0)).toContainText(
      `${editorName} completed ${title}`,
    );
    await expect(viewerLines.nth(1)).toContainText(
      `${editorName} created ${title}`,
    );
    await expect(
      viewerHistory.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(
      viewerHistory.getByRole("button", { name: "Move", exact: true }),
    ).toHaveCount(0);
    await expect(
      viewerHistory.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);
  });

  test("Monthly History keeps both completion periods", async ({ page }) => {
    await useSession(page, editorSession);
    await page.goto(`/spaces/${spaceId}/monthlies`);

    const title = `Activity monthly ${runSuffix()}`;
    await page.getByLabel("Add to Monthlies").fill(title);
    await page.getByLabel("Due day of month").fill("15");
    await page.getByLabel("Add to Monthlies").press("Enter");

    const row = monthlyRow(page, title);
    await expect(row).toBeVisible();
    const due = row.getByText(/^due /);
    const firstPeriod = await duePeriod(row);

    await row
      .getByRole("button", { name: `Mark ${title} done for this period` })
      .click();
    await expect(due).not.toHaveText(`due ${firstPeriod}`);
    const secondPeriod = await duePeriod(row);
    expect(secondPeriod).not.toBe(firstPeriod);

    await row
      .getByRole("button", { name: `Mark ${title} done for this period` })
      .click();
    await expect(due).not.toHaveText(`due ${secondPeriod}`);

    const dialog = await openHistory(page, title);
    const lines = dialog.getByRole("listitem");
    await expect(lines.nth(0)).toContainText(
      `${editorName} completed ${title} for ${secondPeriod}`,
    );
    await expect(lines.nth(1)).toContainText(
      `${editorName} completed ${title} for ${firstPeriod}`,
    );
  });

  test("Read-only ShareBar Activity follows the Active Space", async ({
    page,
  }) => {
    const taskTitle = `Activity share task ${runSuffix()}`;
    const monthlyTitle = `Activity share monthly ${runSuffix()}`;
    const sectionName = `Activity share section ${runSuffix()}`;
    const renamedSection = `Activity renamed section ${runSuffix()}`;
    const otherTitle = `Activity other space task ${runSuffix()}`;

    const task = await ownerApi.post(`/api/v1/spaces/${spaceId}/tasks`, {
      data: { sectionId: dailyId, title: taskTitle },
    });
    expect(task.status()).toBe(201);
    const monthly = await ownerApi.post(
      `/api/v1/spaces/${spaceId}/monthlies`,
      { data: { title: monthlyTitle, dueDayOfMonth: 15 } },
    );
    expect(monthly.status()).toBe(201);
    const section = await ownerApi.post(
      `/api/v1/spaces/${spaceId}/sections`,
      { data: { name: sectionName, kind: "tasks" } },
    );
    expect(section.status()).toBe(201);
    const sectionId = ((await section.json()) as { id: string }).id;
    const other = await ownerApi.post(
      `/api/v1/spaces/${secondSpaceId}/tasks`,
      { data: { sectionId: secondDailyId, title: otherTitle } },
    );
    expect(other.status()).toBe(201);

    await useSession(page, editorSession);
    await page.goto(`/spaces/${spaceId}/${sectionId}`);
    await expect(
      page.getByRole("heading", { name: sectionName, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Actions for ${sectionName}` })
      .click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rename Section" });
    await expect(rename).toBeVisible();
    await rename.getByLabel("Name").fill(renamedSection);
    await rename.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(rename).toBeHidden();
    await expect(
      page.getByRole("heading", { name: renamedSection, exact: true }),
    ).toBeVisible();

    await useSession(page, viewerSession);
    await page.goto(`/spaces/${spaceId}/upcoming`);
    await expect(
      page.getByText(`Active Space · ${spaceName}`),
    ).toBeVisible();
    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite", exact: true }),
    ).toHaveCount(0);

    const here = await openActivity(page);
    await expect(here).toContainText(`${ownerName} created ${taskTitle}`);
    await expect(here).toContainText(`${ownerName} created ${monthlyTitle}`);
    await expect(here).toContainText(
      `${editorName} updated ${renamedSection}`,
    );
    await expect(here).not.toContainText(otherTitle);
    await expect(
      here.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await expect(
      here.getByRole("button", { name: "Move", exact: true }),
    ).toHaveCount(0);
    await expect(
      here.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(0);

    await here.getByRole("button", { name: "Close", exact: true }).click();
    await expect(here).toBeHidden();

    const otherSpace = spacesSidebar(page).getByRole("link", {
      name: secondSpaceName,
      exact: true,
    });
    await expect(otherSpace).toBeVisible();
    await otherSpace.click();
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${secondSpaceId}/upcoming`),
    );
    await expect(
      page.getByText(`Active Space · ${secondSpaceName}`),
    ).toBeVisible();

    const there = await openActivity(page);
    await expect(there).toContainText(`${ownerName} created ${otherTitle}`);
    await expect(there).not.toContainText(taskTitle);
    await expect(there).not.toContainText(monthlyTitle);
    await expect(there).not.toContainText(renamedSection);
  });

  test("deleted Task remains in Activity", async ({ page }) => {
    await useSession(page, editorSession);
    await page.goto(`/spaces/${spaceId}/daily`);

    const title = `Activity delete ${runSuffix()}`;
    await page.getByLabel("Add to Daily").fill(title);
    await page.getByLabel("Add to Daily").press("Enter");
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const menu = await openRowMenu(page, title);
    await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Delete Task" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Actions for ${title}` }),
    ).toHaveCount(0);

    const dialog = await openActivity(page);
    await expect(dialog).toContainText(`${editorName} deleted ${title}`);
  });
});
