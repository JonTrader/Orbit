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
 * Active Space E2E: Section nav, Daily / Monthlies / Upcoming, custom
 * Sections, read-only Viewer chrome, and the share bar. Tests share one
 * owner fixture and build state in order; workers:1 keeps them sequential.
 * Membership-count assertions seed their own Members so they do not couple
 * on order.
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

  // Onboarding runs in the web app, not the API: /spaces ensures the Personal
  // Space before we list Spaces.
  await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
  });

  const spaces = await ownerApi.get("/api/v1/spaces");
  const list = (await spaces.json()) as Array<{ id: string; name: string }>;
  personalSpaceId = list[0].id;
});

test.afterAll(async () => {
  await closeDb();
});

/** Same en-US / UTC short-month formatting as TaskRow / MonthlyRow. */
function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

/** Same en-US / UTC short-month formatting as MonthlyRow.formatDueDate. */
function formatDueLabel(nextDueOn: string): string {
  return `due ${formatShortDate(nextDueOn)}`;
}

async function pickTodayDueDate(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Due date (optional)" }).click();
  const picker = page.getByRole("dialog", { name: "Choose due date" });
  await expect(picker).toBeVisible();
  await picker.getByRole("grid").press("Enter");
  await expect(picker).toBeHidden();
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

async function openRowDeleteMenu(page: Page, title: string): Promise<void> {
  const actions = page.getByRole("button", { name: `Actions for ${title}` });
  await actions.scrollIntoViewIfNeeded();
  await actions.click();
  const menu = page.getByRole("menu", { name: `Actions for ${title}` });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
}

async function cancelThenConfirmDelete(
  page: Page,
  title: string,
  dialogName: string,
): Promise<void> {
  await openRowDeleteMenu(page, title);
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await openRowDeleteMenu(page, title);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
}

/** Advance YYYY-MM-DD by one calendar month, clamping to dueDayOfMonth. */
function advanceNextDueOn(nextDueOn: string, dueDayOfMonth: number): string {
  const [year, month] = nextDueOn.split("-").map(Number);
  const nextYear = month === 12 ? year! + 1 : year!;
  const nextMonth = month === 12 ? 1 : month! + 1;
  const daysInMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const day = Math.min(dueDayOfMonth, daysInMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function spacesSidebar(page: Page) {
  // Sidebar is the spaces-only aside; avoid getByLabel("Spaces"), which also
  // matches the mobile "Open spaces" control via substring label matching.
  return page.getByRole("complementary", { name: "Spaces" });
}

async function goToSectionTab(page: Page, name: string): Promise<void> {
  const tab = page
    .getByRole("tablist", { name: "Sections" })
    .getByRole("tab", { name, exact: true });
  await tab.scrollIntoViewIfNeeded();
  const href = await tab.getAttribute("href");
  if (!href) throw new Error(`Section tab ${name} has no href`);
  // Follow tab hrefs directly: horizontal drag handling on the strip can
  // swallow clicks after scrolling on narrow viewports.
  await page.goto(href);
}

async function authenticate(page: Page): Promise<void> {
  await authenticatePage(page, ownerSession);
  // Land on a Space view directly; "/" only redirects and is racy on cold CI starts.
  await page.goto(`/spaces/${personalSpaceId}/upcoming`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(spacesSidebar(page)).toBeVisible();
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

test.describe("Active Space", () => {
  test("nav order is Upcoming, Daily, Monthlies, customs; no Shared", async ({
    page,
  }) => {
    await authenticate(page);

    const customNames = [
      `Nav tasks ${runSuffix()}`,
      `Nav notes ${runSuffix()}`,
    ] as const;
    for (const [index, name] of customNames.entries()) {
      const created = await ownerApi.post(
        `/api/v1/spaces/${personalSpaceId}/sections`,
        {
          data: {
            name,
            kind: index === 0 ? "tasks" : "notes",
          },
        },
      );
      expect(created.status()).toBe(201);
    }

    await page.goto(`/spaces/${personalSpaceId}/upcoming`);

    const tablist = page.getByRole("tablist", { name: "Sections" });
    await expect(tablist.getByRole("tab").first()).toBeVisible();

    const entries = await tablist.getByRole("tab").evaluateAll((tabs) =>
      tabs.map((tab) => ({
        href: tab.getAttribute("href"),
        label: tab.textContent?.trim() ?? "",
      })),
    );

    expect(entries.map((entry) => entry.label).slice(0, 3)).toEqual([
      "Upcoming",
      "Daily",
      "Monthlies",
    ]);
    expect(entries[0]?.href).toMatch(/\/upcoming$/);
    expect(entries[1]?.href).toMatch(/\/daily$/);
    expect(entries[2]?.href).toMatch(/\/monthlies$/);

    const customLabels = entries.slice(3).map((entry) => entry.label);
    for (const name of customNames) {
      expect(customLabels).toContain(name);
    }
    const firstCustomIndex = Math.min(
      ...customNames.map((name) => customLabels.indexOf(name)),
    );
    expect(firstCustomIndex).toBeGreaterThanOrEqual(0);
    expect(customLabels.slice(firstCustomIndex, firstCustomIndex + 2)).toEqual([
      ...customNames,
    ]);

    const systemSlugs = new Set(["upcoming", "daily", "monthlies"]);
    expect(
      entries.slice(3).every((entry) => {
        const match = entry.href?.match(
          /^\/spaces\/[^/]+\/([0-9a-f-]{36})$/i,
        );
        return Boolean(match && !systemSlugs.has(match[1]!));
      }),
    ).toBe(true);
    expect(entries.map((entry) => entry.label)).not.toContain("Shared");
  });

  test("switching Active Space switches the listed content", async ({
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

    await spacesSidebar(page)
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

  test("Daily: compose adds, completing hides, show-completed reveals", async ({
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

  test("Daily due date compose appears in Daily and Upcoming; undated stays off Upcoming", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto(`/spaces/${personalSpaceId}/daily`);

    const datedTitle = `E2E dated compose ${runSuffix()}`;
    const undatedTitle = `E2E undated compose ${runSuffix()}`;

    await page.getByLabel("Add to Daily").fill(datedTitle);
    const dueOn = await pickTodayDueDate(page);
    await page.getByLabel("Add to Daily").press("Enter");
    await expect(page.getByText(datedTitle, { exact: true })).toBeVisible();
    const datedRow = page
      .locator("div")
      .filter({ has: page.getByText(datedTitle, { exact: true }) })
      .filter({
        has: page.getByRole("checkbox", { name: `Complete ${datedTitle}` }),
      });
    await expect(datedRow.getByText(formatShortDate(dueOn))).toBeVisible();

    await page.getByLabel("Add to Daily").fill(undatedTitle);
    await page.getByLabel("Add to Daily").press("Enter");
    await expect(page.getByText(undatedTitle, { exact: true })).toBeVisible();

    await page.goto(`/spaces/${personalSpaceId}/upcoming`);
    await expect(page.getByText(datedTitle, { exact: true })).toBeVisible();
    await expect(page.getByText(undatedTitle, { exact: true })).toHaveCount(0);
  });

  test("Monthlies: completing rolls the next due date forward", async ({
    page,
  }) => {
    await authenticate(page);

    const title = `E2E monthly ${runSuffix()}`;
    const dueDayOfMonth = 15;
    const created = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/monthlies`,
      { data: { title, dueDayOfMonth } },
    );
    expect(created.status()).toBe(201);
    const { nextDueOn } = (await created.json()) as { nextDueOn: string };
    expect(nextDueOn.endsWith("-15")).toBe(true);

    const expectedBefore = formatDueLabel(nextDueOn);
    const expectedAfter = formatDueLabel(
      advanceNextDueOn(nextDueOn, dueDayOfMonth),
    );

    await page.goto(`/spaces/${personalSpaceId}/monthlies`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const row = page
      .locator("div")
      .filter({ has: page.getByText(title, { exact: true }) })
      .filter({
        has: page.getByRole("button", {
          name: `Mark ${title} done for this period`,
        }),
      });
    const dueLabel = row.getByText(/^due /);
    await expect(dueLabel).toHaveText(expectedBefore);

    await row
      .getByRole("button", { name: `Mark ${title} done for this period` })
      .click();
    await expect(dueLabel).toHaveText(expectedAfter);
  });

  test("Monthlies compose shows Description on the row", async ({ page }) => {
    await authenticate(page);
    await page.goto(`/spaces/${personalSpaceId}/monthlies`);

    const title = `E2E described monthly ${runSuffix()}`;
    const description = `E2E monthly description ${runSuffix()}`;
    await page.getByLabel("Add to Monthlies").fill(title);
    await page.getByLabel("Due day of month").fill("12");
    await page.getByLabel("Description").fill(description);
    await page.getByLabel("Add to Monthlies").press("Enter");

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const row = page
      .locator("div")
      .filter({ has: page.getByText(title, { exact: true }) })
      .filter({
        has: page.getByRole("button", {
          name: `Mark ${title} done for this period`,
        }),
      });
    await expect(row.getByText(description)).toBeVisible();
  });

  test("Upcoming shows dated items and has no compose", async ({
    page,
  }) => {
    await authenticate(page);

    const daily = await sectionIdByKind(personalSpaceId, "daily");
    const datedTitle = `E2E dated ${runSuffix()}`;
    const undatedTitle = `E2E undated ${runSuffix()}`;
    const monthlyTitle = `E2E upcoming monthly ${runSuffix()}`;
    const future = new Date(Date.now() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await ownerApi.post(`/api/v1/spaces/${personalSpaceId}/tasks`, {
      data: { sectionId: daily, title: datedTitle, dueOn: future },
    });
    await ownerApi.post(`/api/v1/spaces/${personalSpaceId}/tasks`, {
      data: { sectionId: daily, title: undatedTitle },
    });
    const monthly = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/monthlies`,
      {
        data: { title: monthlyTitle, dueDayOfMonth: 20 },
      },
    );
    expect(monthly.status()).toBe(201);

    await page.goto(`/spaces/${personalSpaceId}/upcoming`);
    await expect(page.getByText(datedTitle)).toBeVisible();
    await expect(page.getByText(monthlyTitle)).toBeVisible();
    await expect(page.getByText(undatedTitle)).toHaveCount(0);
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  });

  test("Add Section dialog creates working tasks/notes/mixed Sections", async ({
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

      const customTab = page
        .getByRole("tablist", { name: "Sections" })
        .getByRole("tab", { name, exact: true });
      await expect(customTab).toBeVisible();
      await goToSectionTab(page, name);
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }

    // Content: Task in tasks, Note in notes, and both in the mixed Section.
    const tasksSection = `E2E tasks ${runSuffix()}`;
    const notesSection = `E2E notes ${runSuffix()}`;
    const mixedSection = `E2E mixed ${runSuffix()}`;
    await goToSectionTab(page, tasksSection);
    await page.getByLabel(`Add to ${tasksSection}`).fill(`E2E task ${runSuffix()}`);
    await page.getByLabel(`Add to ${tasksSection}`).press("Enter");
    await expect(page.getByText(`E2E task ${runSuffix()}`)).toBeVisible();

    await goToSectionTab(page, notesSection);
    await page
      .getByLabel(`Add to ${notesSection}`)
      .fill(`E2E note ${runSuffix()}`);
    await page.getByLabel("Note body").fill("E2E body");
    await page
      .getByLabel(`Add to ${notesSection}`)
      .press("Enter");
    await expect(
      page.getByText(`E2E note ${runSuffix()}`).locator("xpath=.."),
    ).toContainText("E2E body");

    const mixedTask = `E2E mixed task ${runSuffix()}`;
    const mixedNote = `E2E mixed note ${runSuffix()}`;
    await goToSectionTab(page, mixedSection);
    await page.getByLabel(`Add task to ${mixedSection}`).fill(mixedTask);
    await page.getByLabel(`Add task to ${mixedSection}`).press("Enter");
    await expect(page.getByText(mixedTask)).toBeVisible();

    await page.getByLabel(`Add note to ${mixedSection}`).fill(mixedNote);
    await page.getByLabel("Note body").fill("Mixed body");
    await page.getByLabel(`Add note to ${mixedSection}`).press("Enter");
    await expect(page.getByText(mixedNote)).toBeVisible();
    await expect(
      page.getByText(mixedNote).locator("xpath=.."),
    ).toContainText("Mixed body");
  });

  test("cancel then confirm deletes Task, completed Task, Monthly, and Note", async ({
    page,
  }) => {
    await authenticate(page);

    const daily = await sectionIdByKind(personalSpaceId, "daily");
    const openTitle = `E2E delete task ${runSuffix()}`;
    const completedTitle = `E2E delete completed ${runSuffix()}`;
    const monthlyTitle = `E2E delete monthly ${runSuffix()}`;
    const notesName = `E2E delete notes ${runSuffix()}`;
    const noteTitle = `E2E delete note ${runSuffix()}`;

    const openTask = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/tasks`,
      { data: { sectionId: daily, title: openTitle } },
    );
    expect(openTask.status()).toBe(201);
    const completedTask = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/tasks`,
      { data: { sectionId: daily, title: completedTitle } },
    );
    expect(completedTask.status()).toBe(201);
    const monthly = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/monthlies`,
      { data: { title: monthlyTitle, dueDayOfMonth: 8 } },
    );
    expect(monthly.status()).toBe(201);
    const notesSection = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/sections`,
      { data: { name: notesName, kind: "notes" } },
    );
    expect(notesSection.status()).toBe(201);
    const notesSectionId = (await notesSection.json()).id as string;
    const note = await ownerApi.post(
      `/api/v1/spaces/${personalSpaceId}/notes`,
      { data: { sectionId: notesSectionId, title: noteTitle, body: "Gone" } },
    );
    expect(note.status()).toBe(201);

    await page.goto(`/spaces/${personalSpaceId}/daily`);
    await cancelThenConfirmDelete(page, openTitle, "Delete Task");

    await page.getByRole("checkbox", { name: `Complete ${completedTitle}` }).click();
    await expect(page.getByText(completedTitle, { exact: true })).toBeHidden();
    await page.getByRole("button", { name: /Show completed/ }).click();
    await expect(page.getByText(completedTitle, { exact: true })).toBeVisible();
    await cancelThenConfirmDelete(page, completedTitle, "Delete Task");

    await page.goto(`/spaces/${personalSpaceId}/monthlies`);
    await cancelThenConfirmDelete(page, monthlyTitle, "Delete Monthly");

    await page.goto(`/spaces/${personalSpaceId}/${notesSectionId}`);
    await cancelThenConfirmDelete(page, noteTitle, "Delete Note");
  });

  test("read-only member sees the badge and no mutation controls", async ({
    page,
    request,
  }) => {
    const spaceName = `Read-only Host ${runSuffix()}`;
    const created = await ownerApi.post("/api/v1/spaces", {
      data: { name: spaceName },
    });
    expect(created.status()).toBe(201);
    const spaceId = (await created.json()).id as string;

    const taskTitle = `Viewer task ${runSuffix()}`;
    const monthlyTitle = `Viewer monthly ${runSuffix()}`;
    const notesName = `Viewer notes ${runSuffix()}`;
    const noteTitle = `Viewer note ${runSuffix()}`;
    const daily = await sectionIdByKind(spaceId, "daily");
    const seededTask = await ownerApi.post(`/api/v1/spaces/${spaceId}/tasks`, {
      data: { sectionId: daily, title: taskTitle },
    });
    expect(seededTask.status()).toBe(201);
    const seededMonthly = await ownerApi.post(
      `/api/v1/spaces/${spaceId}/monthlies`,
      { data: { title: monthlyTitle, dueDayOfMonth: 10, body: "Viewer body" } },
    );
    expect(seededMonthly.status()).toBe(201);
    const notesSection = await ownerApi.post(
      `/api/v1/spaces/${spaceId}/sections`,
      { data: { name: notesName, kind: "notes" } },
    );
    expect(notesSection.status()).toBe(201);
    const notesSectionId = (await notesSection.json()).id as string;
    const seededNote = await ownerApi.post(`/api/v1/spaces/${spaceId}/notes`, {
      data: { sectionId: notesSectionId, title: noteTitle, body: "Viewer note" },
    });
    expect(seededNote.status()).toBe(201);

    const member = await createVerifiedUser(request, "E2E Member");
    const memberSession = await signIn(request, member);
    await addMemberReadOnly(request, ownerSession, spaceId, member, memberSession);

    await authenticatePage(page, memberSession);
    await page.goto(`/spaces/${spaceId}/daily`);

    await expect(page.getByText("Read-only", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add to Daily")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Section" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await expect(page.getByText("2 people")).toBeVisible();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Actions for ${taskTitle}` }),
    ).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/monthlies`);
    await expect(page.getByText(monthlyTitle, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Actions for ${monthlyTitle}` }),
    ).toHaveCount(0);

    await page.goto(`/spaces/${spaceId}/${notesSectionId}`);
    await expect(page.getByText(noteTitle, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Actions for ${noteTitle}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Actions for ${notesName}` }),
    ).toHaveCount(0);
  });

  test("share bar shows members; Owner sees the invite entry point", async ({
    page,
    request,
  }) => {
    const spaceName = `Share Bar Host ${runSuffix()}`;
    const created = await ownerApi.post("/api/v1/spaces", {
      data: { name: spaceName },
    });
    expect(created.status()).toBe(201);
    const spaceId = (await created.json()).id as string;

    const member = await createVerifiedUser(request, "E2E Share Member");
    const memberSession = await signIn(request, member);
    await addMemberReadOnly(
      request,
      ownerSession,
      spaceId,
      member,
      memberSession,
    );

    await authenticate(page);
    await page.goto(`/spaces/${spaceId}/daily`);

    await expect(page.getByText("2 people")).toBeVisible();
    await expect(page.getByTitle(/Owner/)).toBeVisible();
    await expect(page.getByTitle(/Read-only/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  });
});
