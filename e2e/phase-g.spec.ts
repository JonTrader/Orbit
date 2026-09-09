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
 * order; workers:1 keeps them sequential. Membership-count assertions seed
 * their own Members so G7/G8 do not couple on order.
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

const MONTH_ABBREV = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function nextMonthAbbrev(current: string): string {
  const index = MONTH_ABBREV.indexOf(
    current as (typeof MONTH_ABBREV)[number],
  );
  if (index < 0) {
    throw new Error(`Unexpected month label: ${current}`);
  }
  return MONTH_ABBREV[(index + 1) % 12]!;
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

test.describe("Phase G", () => {
  test("1. nav order is Upcoming, Daily, Monthlies, customs; no Shared", async ({
    page,
  }) => {
    await authenticate(page);

    const customNames = [
      `G1 tasks ${runSuffix()}`,
      `G1 notes ${runSuffix()}`,
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
    await expect(dueLabel).toHaveText(/^due \w+ 15$/);

    const before = (await dueLabel.textContent())?.trim() ?? "";
    const beforeMonth = before.replace(/^due /, "").split(" ")[0] ?? "";
    const expectedAfter = `due ${nextMonthAbbrev(beforeMonth)} 15`;

    await row
      .getByRole("button", { name: `Mark ${title} done for this period` })
      .click();
    await expect(dueLabel).toHaveText(expectedAfter);
  });

  test("5. Upcoming shows dated items and has no compose", async ({
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

  test("7. read-only member sees the badge and no mutation controls", async ({
    page,
    request,
  }) => {
    const spaceName = `Read-only Host ${runSuffix()}`;
    const created = await ownerApi.post("/api/v1/spaces", {
      data: { name: spaceName },
    });
    expect(created.status()).toBe(201);
    const spaceId = (await created.json()).id as string;

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
  });

  test("8. share bar shows members; Owner sees the invite entry point", async ({
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
