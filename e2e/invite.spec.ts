import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  acceptInviteUrl,
  authenticatePage,
  closeDb,
  cookieHeader,
  createVerifiedUser,
  expirePendingInvite,
  findPendingInvite,
  markEmailVerified,
  newInviteBearerToken,
  pinInviteBearerToken,
  runSuffix,
  setInviteBearerToken,
  signIn,
  spaceMembers,
} from "./helpers";

/**
 * Phase H Invite + ShareBar management E2E. Playwright clears Resend env for
 * the app under test; after Owner invite/resend, helpers pin a known bearer
 * token onto the pending Invite digest so accept links are deterministic.
 */

let ownerApi: APIRequestContext;
let owner: { email: string; password: string; name: string };
let ownerSession: string;

test.beforeAll(async ({ request }) => {
  owner = await createVerifiedUser(request, "Invite Owner");
  ownerSession = await signIn(request, owner);
  ownerApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: cookieHeader(ownerSession) },
  });
  // Onboarding runs in the web app: /spaces ensures the Personal Space so
  // later leave flows are not blocked by LAST_SPACE.
  const onboard = await request.get("/spaces", {
    headers: { cookie: cookieHeader(ownerSession) },
    maxRedirects: 5,
  });
  expect(onboard.ok()).toBeTruthy();

  const spaces = await ownerApi.get("/api/v1/spaces");
  expect(spaces.status()).toBe(200);
  const list = (await spaces.json()) as Array<{ id: string; name: string }>;
  expect(list.some((row) => row.name === "Personal")).toBe(true);
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

async function authenticateOwner(page: Page, spaceId: string): Promise<void> {
  await page.context().clearCookies();
  await authenticatePage(page, ownerSession);
  await page.goto(`/spaces/${spaceId}/upcoming`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function openInviteDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(
    page.getByRole("dialog", { name: "Invite to Space" }),
  ).toBeVisible();
}

async function sendInviteFromDialog(
  page: Page,
  email: string,
  role: "Read-only" | "Editor" = "Read-only",
): Promise<void> {
  await openInviteDialog(page);
  const dialog = page.getByRole("dialog", { name: "Invite to Space" });
  await dialog.locator("#invite-email").fill(email);
  if (role !== "Read-only") {
    await dialog.getByText(role, { exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(dialog).toHaveCount(0);
}

async function openPeopleDialog(page: Page): Promise<void> {
  const peopleDialog = page.getByRole("dialog", { name: "People" });
  if (await peopleDialog.isVisible().catch(() => false)) {
    return;
  }
  await page.getByRole("button", { name: /People in this Space/ }).click();
  await expect(peopleDialog).toBeVisible();
}

/** Click Accept Invite and fail if the generic error page paints before Upcoming. */
async function acceptInviteWithoutErrorFlash(
  page: Page,
  spaceId: string,
): Promise<void> {
  const errorFlash = page.getByRole("heading", { name: "Something went wrong" });
  let sawError = false;
  void errorFlash
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => {
      sawError = true;
    })
    .catch(() => {
      // Timeout or navigation tore down the accept page; not a flash.
    });

  await page.getByRole("button", { name: "Accept Invite" }).click();
  await page.waitForURL(new RegExp(`/spaces/${spaceId}/upcoming`), {
    timeout: 30_000,
  });
  expect(sawError).toBe(false);
  await expect(errorFlash).toHaveCount(0);
}

test.describe("Invite accept and ShareBar management", () => {
  test("Owner invites; recipient signs up, verifies, accepts as read-only", async ({
    page,
  }) => {
    const spaceName = `Invite Join ${runSuffix()}`;
    const spaceId = await createOwnedSpace(spaceName);
    const recipientEmail = `new-member-${runSuffix()}@e2e.orbit.test`;
    const password = `orbit-e2e-${runSuffix()}aa`;
    const rawToken = newInviteBearerToken();

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, recipientEmail);

    await openPeopleDialog(page);
    const people = page.getByRole("dialog", { name: "People" });
    await expect(people.getByText(recipientEmail)).toBeVisible();
    await expect(people.getByText(/Read-only · Pending/)).toBeVisible();
    await people.getByRole("button", { name: "Close" }).click();

    await pinInviteBearerToken(spaceId, recipientEmail, rawToken);

    await page.context().clearCookies();
    await page.goto(acceptInviteUrl(rawToken));
    await expect(
      page.getByRole("heading", { name: "Join this Space" }),
    ).toBeVisible();
    await expect(page.getByText(spaceName, { exact: true })).toBeVisible();
    await expect(page.getByText(/as Read-only/)).toBeVisible();

    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/sign-up\?/);
    await page.getByLabel("Name").fill("Invite Newcomer");
    await page.getByLabel("Email").fill(recipientEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByRole("heading", { name: "Verify your email" }),
    ).toBeVisible();

    await markEmailVerified(recipientEmail);
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in\?/);
    await page.getByLabel("Email").fill(recipientEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("heading", { name: "Accept Invite" }),
    ).toBeVisible({ timeout: 30_000 });
    await acceptInviteWithoutErrorFlash(page, spaceId);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/2 people/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
  });

  test("expired Invite UX; resend then accept works", async ({
    page,
    request,
  }) => {
    const spaceName = `Invite Expiry ${runSuffix()}`;
    const spaceId = await createOwnedSpace(spaceName);
    const recipient = await createVerifiedUser(
      request,
      "Invite Expiry Recipient",
    );
    const expiredToken = newInviteBearerToken();
    const freshToken = newInviteBearerToken();

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, recipient.email);

    const inviteId = await pinInviteBearerToken(
      spaceId,
      recipient.email,
      expiredToken,
    );
    await expirePendingInvite(inviteId);

    await page.context().clearCookies();
    await page.goto(acceptInviteUrl(expiredToken));
    await expect(
      page.getByRole("heading", { name: "Invite expired" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Ask the Space Owner to resend/),
    ).toBeVisible();

    await authenticateOwner(page, spaceId);
    await openPeopleDialog(page);
    const people = page.getByRole("dialog", { name: "People" });
    await expect(people.getByText(/Expired/)).toBeVisible();
    await people.getByRole("button", { name: "Resend" }).click();
    await expect(people.getByText(/Pending/)).toBeVisible();
    await people.getByRole("button", { name: "Close" }).click();

    // Resend rotates the secret; pin a known bearer for the accept hop.
    const pending = await findPendingInvite(spaceId, recipient.email);
    expect(pending).not.toBeNull();
    await setInviteBearerToken(pending!.id, freshToken);

    const recipientSession = await signIn(request, recipient);
    await authenticatePage(page, recipientSession);
    await page.goto(acceptInviteUrl(freshToken));
    await expect(
      page.getByRole("heading", { name: "Accept Invite" }),
    ).toBeVisible();
    await acceptInviteWithoutErrorFlash(page, spaceId);

    const members = await spaceMembers(request, recipientSession, spaceId);
    expect(members.some((row) => row.name === recipient.name)).toBe(true);
  });

  test("wrong-account UX is safe and does not accept", async ({
    page,
    request,
  }) => {
    const spaceId = await createOwnedSpace(`Invite Wrong ${runSuffix()}`);
    const invited = await createVerifiedUser(request, "Invite Intended");
    const wrong = await createVerifiedUser(request, "Invite Wrong Account");
    const rawToken = newInviteBearerToken();

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, invited.email);
    await pinInviteBearerToken(spaceId, invited.email, rawToken);

    const wrongSession = await signIn(request, wrong);
    await authenticatePage(page, wrongSession);
    await page.goto(acceptInviteUrl(rawToken));
    await expect(
      page.getByRole("heading", { name: "Wrong account" }),
    ).toBeVisible();
    await expect(page.getByText(wrong.email)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accept Invite" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Switch account" }),
    ).toBeVisible();

    const members = await spaceMembers(request, ownerSession, spaceId);
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe("owner");
  });

  test("transfer demotes former Owner; leave works afterward", async ({
    page,
    request,
  }) => {
    const spaceId = await createOwnedSpace(`Invite Transfer ${runSuffix()}`);
    const editor = await createVerifiedUser(request, "Invite Transfer Editor");
    const editorSession = await signIn(request, editor);
    const rawToken = newInviteBearerToken();

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, editor.email, "Editor");
    await pinInviteBearerToken(spaceId, editor.email, rawToken);

    await authenticatePage(page, editorSession);
    await page.goto(acceptInviteUrl(rawToken));
    await acceptInviteWithoutErrorFlash(page, spaceId);

    await authenticateOwner(page, spaceId);
    await openPeopleDialog(page);
    const people = page.getByRole("dialog", { name: "People" });
    await people
      .getByRole("button", { name: `Actions for ${editor.name}` })
      .click();
    await page.getByRole("menuitem", { name: "Transfer ownership" }).click();
    const transfer = page.getByRole("dialog", { name: "Transfer ownership" });
    await transfer.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(transfer).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await openPeopleDialog(page);
    const peopleAfter = page.getByRole("dialog", { name: "People" });
    await expect(
      peopleAfter.getByRole("button", { name: "Leave Space" }),
    ).toBeVisible();
    await peopleAfter.getByRole("button", { name: "Leave Space" }).click();
    const leave = page.getByRole("dialog", { name: "Leave Space" });
    await leave.getByRole("button", { name: "Leave" }).click();
    // Leave returns through `/spaces` → entry Upcoming, not the left Space.
    await expect(leave).toHaveCount(0);
    await expect(page).not.toHaveURL(new RegExp(`/spaces/${spaceId}/`));
    await expect(page).toHaveURL(/\/spaces\/[^/]+\/upcoming$/);

    const members = await spaceMembers(request, editorSession, spaceId);
    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe(editor.name);
    expect(members[0]?.role).toBe("owner");

    // Owner-cannot-leave guard (API): still holds on Spaces the actor owns.
    const stillOwned = await createOwnedSpace(`Invite Guard ${runSuffix()}`);
    const blocked = await ownerApi.post(
      `/api/v1/spaces/${stillOwned}/members/leave`,
    );
    expect(blocked.status()).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({
      error: { code: "OWNER_CANNOT_LEAVE" },
    });
  });

  test("People dialog role change, remove, and Owner-only pending Invites", async ({
    page,
    request,
  }) => {
    const spaceId = await createOwnedSpace(`Invite Manage ${runSuffix()}`);
    const member = await createVerifiedUser(request, "Invite Manage Member");
    const memberSession = await signIn(request, member);
    const rawToken = newInviteBearerToken();
    const pendingEmail = `pending-${runSuffix()}@e2e.orbit.test`;

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, member.email);
    await pinInviteBearerToken(spaceId, member.email, rawToken);

    await page.context().clearCookies();
    await authenticatePage(page, memberSession);
    await page.goto(acceptInviteUrl(rawToken));
    await acceptInviteWithoutErrorFlash(page, spaceId);

    await authenticateOwner(page, spaceId);
    await sendInviteFromDialog(page, pendingEmail);

    // Non-Owner Viewer: People opens, but Invite + pending list stay Owner-only.
    await page.context().clearCookies();
    await authenticatePage(page, memberSession);
    await page.goto(`/spaces/${spaceId}/upcoming`);
    await expect(page.getByRole("button", { name: "Invite" })).toHaveCount(0);
    await openPeopleDialog(page);
    const memberPeople = page.getByRole("dialog", { name: "People" });
    await expect(memberPeople.getByText(pendingEmail)).toHaveCount(0);
    await expect(memberPeople.getByText("Pending Invites")).toHaveCount(0);
    await memberPeople.getByRole("button", { name: "Close" }).click();

    await authenticateOwner(page, spaceId);
    await openPeopleDialog(page);
    const people = page.getByRole("dialog", { name: "People" });
    await expect(people.getByText(pendingEmail)).toBeVisible();
    await people
      .getByRole("button", { name: `Actions for ${member.name}` })
      .click();
    await page.getByRole("menuitem", { name: "Make Editor" }).click();

    await expect
      .poll(async () => {
        const rows = await spaceMembers(request, ownerSession, spaceId);
        return rows.find((row) => row.name === member.name)?.role;
      })
      .toBe("editor");

    await people
      .getByRole("button", { name: `Actions for ${member.name}` })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    const remove = page.getByRole("dialog", { name: "Remove Member" });
    await remove.getByRole("button", { name: "Remove" }).click();
    await expect(remove).toHaveCount(0);

    await expect
      .poll(async () => {
        const rows = await spaceMembers(request, ownerSession, spaceId);
        return rows.length;
      })
      .toBe(1);
  });

  test("ShareBar Invite is keyboard reachable; People works at mobile width", async ({
    page,
  }) => {
    const spaceId = await createOwnedSpace(`Invite A11y ${runSuffix()}`);
    await authenticateOwner(page, spaceId);

    const inviteButton = page.getByRole("button", { name: "Invite" });
    await inviteButton.focus();
    await expect(inviteButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Invite to Space" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Invite to Space" }),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/spaces/${spaceId}/upcoming`);
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
    await openPeopleDialog(page);
    await expect(page.getByRole("dialog", { name: "People" })).toBeVisible();
    await expect(page.getByText("1 person")).toBeVisible();
  });
});
