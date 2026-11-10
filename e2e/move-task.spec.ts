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
 * Move Task E2E: an Editor moves Tasks (open and completed) from the row menu
 * into custom Sections, the dialog offers only legal destinations, and a
 * Read-only Viewer has History but no Move. Setup goes through the API; the behavior under
 * test goes through the browser.
 */

let ownerApi: APIRequestContext;
let spaceId: string;
let dailyId: string;
let editorSession: string;
let viewerSession: string;

const tasksName = `Move tasks ${runSuffix()}`;
const targetName = `Move target ${runSuffix()}`;
const mixedName = `Move mixed ${runSuffix()}`;
const notesName = `Move notes ${runSuffix()}`;

let tasksId: string;
let targetId: string;
let mixedId: string;

async function createSection(
  name: string,
  kind: "tasks" | "mixed" | "notes",
): Promise<string> {
  const response = await ownerApi.post(`/api/v1/spaces/${spaceId}/sections`, {
    data: { name, kind },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function createTask(sectionId: string, title: string): Promise<string> {
  const response = await ownerApi.post(`/api/v1/spaces/${spaceId}/tasks`, {
    data: { sectionId, title },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.beforeAll(async ({ request }) => {
  const owner = await createVerifiedUser(request, "E2E Move Owner");
  const ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });

  await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
  });
  const spaces = await ownerApi.get("/api/v1/spaces");
  spaceId = ((await spaces.json()) as Array<{ id: string }>)[0]!.id;

  const editor = await createVerifiedUser(request, "E2E Move Editor");
  editorSession = await signIn(request, editor);
  await addMemberReadOnly(
    request,
    ownerSession,
    spaceId,
    editor,
    editorSession,
    "editor",
  );

  const viewer = await createVerifiedUser(request, "E2E Move Viewer");
  viewerSession = await signIn(request, viewer);
  await addMemberReadOnly(request, ownerSession, spaceId, viewer, viewerSession);

  const sections = await ownerApi.get(`/api/v1/spaces/${spaceId}/sections`);
  const daily = ((await sections.json()) as Array<{ id: string; kind: string }>)
    .find((row) => row.kind === "daily");
  if (!daily) throw new Error("No Daily section");
  dailyId = daily.id;

  tasksId = await createSection(tasksName, "tasks");
  targetId = await createSection(targetName, "tasks");
  mixedId = await createSection(mixedName, "mixed");
  await createSection(notesName, "notes");
});

test.afterAll(async () => {
  await ownerApi.dispose();
  await closeDb();
});

async function openMoveDialog(page: Page, title: string) {
  const actions = page.getByRole("button", { name: `Actions for ${title}` });
  await actions.scrollIntoViewIfNeeded();
  await actions.click();
  const menu = page.getByRole("menu", { name: `Actions for ${title}` });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Move", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Move Task" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function destinationNames(dialog: Locator): Promise<string[]> {
  return dialog
    .getByRole("radio")
    .evaluateAll((radios) =>
      radios.map((radio) => radio.closest("label")?.textContent?.trim() ?? ""),
    );
}

test.describe("Move Task", () => {
  test("Editor moves a Daily Task into a custom tasks Section", async ({
    page,
  }) => {
    await authenticatePage(page, editorSession);

    const title = `E2E move ${runSuffix()}`;
    await createTask(dailyId, title);

    await page.goto(`/spaces/${spaceId}/daily`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const dialog = await openMoveDialog(page, title);
    const submit = dialog.getByRole("button", { name: "Move", exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole("radio", { name: targetName, exact: true }).check();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/${targetId}`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: `Complete ${title}` }),
    ).toBeVisible();

    await page.goto(`/spaces/${spaceId}/daily`);
    await expect(page.getByLabel("Add to Daily")).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  });

  test("dialog lists legal destinations and excludes Monthlies, notes, and the current Section", async ({
    page,
  }) => {
    await authenticatePage(page, editorSession);

    const dailyTitle = `E2E dest daily ${runSuffix()}`;
    const customTitle = `E2E dest custom ${runSuffix()}`;
    await createTask(dailyId, dailyTitle);
    await createTask(tasksId, customTitle);

    // From Daily: custom tasks + mixed only; Daily (current), Monthlies, and
    // the notes Section are absent.
    await page.goto(`/spaces/${spaceId}/daily`);
    const fromDaily = await openMoveDialog(page, dailyTitle);
    expect(await destinationNames(fromDaily)).toEqual([
      tasksName,
      targetName,
      mixedName,
    ]);
    await expect(
      fromDaily.getByRole("radio", { name: "Daily", exact: true }),
    ).toHaveCount(0);
    await expect(
      fromDaily.getByRole("radio", { name: "Monthlies", exact: true }),
    ).toHaveCount(0);
    await expect(
      fromDaily.getByRole("radio", { name: notesName, exact: true }),
    ).toHaveCount(0);
    await fromDaily.getByRole("button", { name: "Cancel" }).click();
    await expect(fromDaily).toBeHidden();

    // From a custom tasks Section: Daily first, then the other tasks and the
    // mixed Section; the current Section is absent.
    await page.goto(`/spaces/${spaceId}/${tasksId}`);
    const fromCustom = await openMoveDialog(page, customTitle);
    expect(await destinationNames(fromCustom)).toEqual([
      "Daily",
      targetName,
      mixedName,
    ]);
    await expect(
      fromCustom.getByRole("radio", { name: tasksName, exact: true }),
    ).toHaveCount(0);
    await expect(
      fromCustom.getByRole("radio", { name: "Monthlies", exact: true }),
    ).toHaveCount(0);
    await expect(
      fromCustom.getByRole("radio", { name: notesName, exact: true }),
    ).toHaveCount(0);

    // Custom tasks -> mixed also works and lands in the mixed Section.
    await fromCustom.getByRole("radio", { name: mixedName, exact: true }).check();
    await fromCustom.getByRole("button", { name: "Move", exact: true }).click();
    await expect(fromCustom).toBeHidden();
    await expect(page.getByText(customTitle, { exact: true })).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/${mixedId}`);
    await expect(page.getByText(customTitle, { exact: true })).toBeVisible();
  });

  test("Read-only Viewer has no Move on Daily", async ({ page }) => {
    const title = `E2E move viewer ${runSuffix()}`;
    await createTask(dailyId, title);

    await authenticatePage(page, viewerSession);
    await page.goto(`/spaces/${spaceId}/daily`);

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    const actions = page.getByRole("button", { name: `Actions for ${title}` });
    await expect(actions).toBeVisible();
    await actions.click();
    const menu = page.getByRole("menu", { name: `Actions for ${title}` });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "History", exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Move", exact: true }),
    ).toHaveCount(0);
    await expect(
      menu.getByRole("menuitem", { name: "Edit", exact: true }),
    ).toHaveCount(0);
  });

  test("Editor moves a completed Task and it stays completed", async ({
    page,
  }) => {
    await authenticatePage(page, editorSession);

    const title = `E2E move completed ${runSuffix()}`;
    const taskId = await createTask(dailyId, title);
    const completed = await ownerApi.post(
      `/api/v1/spaces/${spaceId}/tasks/${taskId}/complete`,
    );
    expect(completed.status()).toBe(200);

    await page.goto(`/spaces/${spaceId}/daily`);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /Show completed/ }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();

    const dialog = await openMoveDialog(page, title);
    await dialog.getByRole("radio", { name: targetName, exact: true }).check();
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/${targetId}`);
    // Completed Tasks hide behind the same control as on Daily.
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /Show completed/ }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();
  });
});
