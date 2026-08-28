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
 * Phase G acceptance (Orbit_Test_Plan.md, Phase G items 1-8), against the
 * real app + dev database. Tests share one owner fixture and build state in
 * order; workers:1 keeps them sequential.
 */

let ownerApi: APIRequestContext;
let owner: { email: string; password: string; name: string };
let ownerSession: string;
let personalSpaceId: string;

test.beforeAll(async ({ request }) => {
  owner = await createVerifiedUser(request, "E2E Owner");
  ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });

  // Onboarding runs in the app shell, not the API: loading "/" once makes
  // the entry route create the Personal Space before we list Spaces.
  await request.get("/", { headers: { cookie: cookieHeader(ownerSession) } });

  const spaces = await ownerApi.get("/api/v1/spaces");
  const list = (await spaces.json()) as Array<{ id: string; name: string }>;
  personalSpaceId = list[0].id;
});

test.afterAll(async () => {
  await closeDb();
});

async function authenticate(page: Page): Promise<void> {
  await authenticatePage(page, ownerSession);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function sectionIdByKind(
  spaceId: string,
  kind: "daily" | "tasks" | "notes" | "mixed",
): Promise<string> {
  const response = await ownerApi.get(`/api/v1/spaces/${spaceId}/sections`);
  const sections = (await response.json()) as Array<{
    id: string;
    kind: string;
  }>;
  const section = sections.find((row) => row.kind === kind);
  if (!section) throw new Error(`No ${kind} section in space ${spaceId}`);
  return section.id;
}

test.describe("Phase G", () => {
  test("1. nav order is Upcoming, Daily, Monthlies, customs; no Shared", async ({
    page,
  }) => {
    await authenticate(page);

    const links = page
      .getByLabel("Spaces and sections")
      .getByRole("link", { name: "In this Space" })
      .or(page.getByLabel("Spaces and sections").locator("div"))
      .locator("a");

    // Assert on the "In this Space" block directly.
    const inThisSpace = page.locator(
      'aside [class*="flex flex-col gap-0.5"]:has-text("In this Space") a',
    );
    const hrefs = await inThisSpace.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")),
    );
    expect(hrefs[0]).toMatch(/\/upcoming$/);
    expect(hrefs[1]).toMatch(/\/daily$/);
    expect(hrefs[2]).toMatch(/\/monthlies$/);
    expect(hrefs.slice(3).every((href) => href?.includes("/sections/"))).toBe(
      true,
    );
    expect(page.getByText("Shared", { exact: true })).toHaveCount(0);
    void links;
  });

  test("2. switching Active Space switches the listed content", async ({
    page,
  }) => {
    await authenticate(page);

    // Distinct task in the owner's Personal Daily...
    const personalDaily = await sectionIdByKind(personalSpaceId, "daily");
    await ownerApi.post(`/api/v1/spaces/${personalSpaceId}/tasks`, {
      data: { sectionId: personalDaily, title: `Personal-only ${runSuffix()}` },
    });

    // ...and a second Space with its own Daily task.
    const created = await ownerApi.post("/api/v1/spaces", {
      data: { name: `Second ${runSuffix()}` },
    });
    const secondSpaceId = (await created.json()).id as string;
    const secondDaily = await sectionIdByKind(secondSpaceId, "daily");
    await ownerApi.post(`/api/v1/spaces/${secondSpaceId}/tasks`, {
      data: { sectionId: secondDaily, title: `Second-only ${runSuffix()}` },
    });

    await page.goto(`/spaces/${secondSpaceId}/daily`);
    await expect(
      page.getByText(`Second-only ${runSuffix()}`),
    ).toBeVisible();
    await expect(
      page.getByText(`Personal-only ${runSuffix()}`),
    ).toHaveCount(0);

    await page
      .getByLabel("Spaces and sections")
      .getByRole("link", { name: "Personal", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${personalSpaceId}/upcoming`));

    // The Space link lands on Upcoming; the undated fixture task lives in Daily.
    await page.goto(`/spaces/${personalSpaceId}/daily`);
    await expect(
      page.getByText(`Personal-only ${runSuffix()}`),
    ).toBeVisible();
    await expect(page.getByText(`Second-only ${runSuffix()}`)).toHaveCount(0);
  });

  test("3. Daily: compose adds, completing hides, show-completed reveals", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto(`/spaces/${personalSpaceId}/daily`);

    const title = `E2E daily ${runSuffix()}`;
    await page.getByLabel("Add to Daily").fill(title);
    await page.getByLabel("Add to Daily").press("Enter");
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("checkbox", { name: `Complete ${title}` }).click();
    await expect(page.getByText(title)).toBeHidden();

    await page.getByRole("button", { name: /Show completed/ }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("checkbox", { name: `Reopen ${title}` }).click();
  });

  test("4. Monthlies: completing rolls the next due date forward", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto(`/spaces/${personalSpaceId}/monthlies`);

    const title = `E2E monthly ${runSuffix()}`;
    await page.getByLabel("Add to Monthlies").fill(title);
    await page.getByLabel("Due day of month").fill("15");
    await page.getByLabel("Add to Monthlies").press("Enter");
    await expect(page.getByText(title)).toBeVisible();

    const row = page.locator("div", { hasText: title }).getByRole("button", {
      name: "Done",
    });
    const before = await page
      .locator(`text=${title}`)
      .locator("xpath=..")
      .innerText();
    await row.click();
    await expect(page.locator(`text=${title}`).locator("xpath=..")).not.toHaveText(
      before,
    );
  });

  test("5. Upcoming shows dated items and has no compose", async ({
    page,
  }) => {
    await authenticate(page);

    const daily = await sectionIdByKind(personalSpaceId, "daily");
    const future = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await ownerApi.post(`/api/v1/spaces/${personalSpaceId}/tasks`, {
      data: { sectionId: daily, title: `E2E dated ${runSuffix()}`, dueOn: future },
    });

    await page.goto(`/spaces/${personalSpaceId}/upcoming`);
    await expect(page.getByText(`E2E dated ${runSuffix()}`)).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  });

  test("6. Add Section dialog creates working tasks/notes/mixed Sections", async ({
    page,
  }) => {
    await authenticate(page);

    const cases = [
      { name: `E2E tasks ${runSuffix()}`, label: "Tasks" },
      { name: `E2E notes ${runSuffix()}`, label: "Notes" },
      { name: `E2E mixed ${runSuffix()}`, label: "Mixed" },
    ] as const;

    for (const { name, label } of cases) {
      await page.getByRole("button", { name: "Add Section" }).click();
      const dialog = page.getByRole("dialog", { name: "Add Section" });
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByText(label, { exact: true }).click();
      await dialog.getByRole("button", { name: "Add Section" }).click();
      await expect(dialog).toBeHidden();

      const customHref = page
        .getByLabel("Spaces and sections")
        .locator(`a:has-text("${name}")`);
      await customHref.click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }

    // Content: a Task in the tasks Section and a Note with body in notes.
    await page
      .getByLabel("Spaces and sections")
      .locator(`a:has-text("E2E tasks ${runSuffix()}")`)
      .click();
    await page.getByLabel(`Add to E2E tasks ${runSuffix()}`).fill(`E2E task ${runSuffix()}`);
    await page.getByLabel(`Add to E2E tasks ${runSuffix()}`).press("Enter");
    await expect(page.getByText(`E2E task ${runSuffix()}`)).toBeVisible();

    await page
      .getByLabel("Spaces and sections")
      .locator(`a:has-text("E2E notes ${runSuffix()}")`)
      .click();
    await page
      .getByLabel(`Add to E2E notes ${runSuffix()}`)
      .fill(`E2E note ${runSuffix()}`);
    await page.getByLabel("Note body").fill("E2E body");
    await page
      .getByLabel(`Add to E2E notes ${runSuffix()}`)
      .press("Enter");
    await expect(
      page.getByText(`E2E note ${runSuffix()}`).locator("xpath=.."),
    ).toContainText("E2E body");
  });

  test("7. read-only member sees the badge and no mutation controls", async ({
    page,
    request,
  }) => {
    const member = await createVerifiedUser(request, "E2E Member");
    const memberSession = await signIn(request, member);
    await addMemberReadOnly(request, ownerSession, personalSpaceId, member, memberSession);

    await authenticatePage(page, memberSession);
    await page.goto(`/spaces/${personalSpaceId}/daily`);

    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Section" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await expect(page.getByText("2 people")).toBeVisible();
  });

  test("8. share bar shows members; Owner sees the invite entry point", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto(`/spaces/${personalSpaceId}/daily`);

    await expect(page.getByText("2 people")).toBeVisible();
    await expect(page.getByTitle(/Owner/)).toBeVisible();
    await expect(page.getByTitle(/Read-only/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  });
});
