import { Pool } from "@neondatabase/serverless";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { bootstrapE2eDatabaseUrl } from "./env";

/**
 * E2E helpers: real verified users, real Spaces, real cookies. Users are
 * created through Better Auth's own HTTP endpoints and then verified by a
 * direct database update, because the verification email cannot be received
 * by a test address.
 */

bootstrapE2eDatabaseUrl();

/** Matches playwright.config baseURL and BETTER_AUTH_URL default. */
const AUTH_ORIGIN =
  process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";

/** Better Auth rejects cookie-bearing auth POSTs without a trusted Origin. */
const authHeaders = { origin: AUTH_ORIGIN };

let pool: Pool | undefined;

function db(): Pool {
  // DATABASE_URL only — bootstrapE2eDatabaseUrl() already redirected it to
  // DATABASE_URL_TEST when configured, matching the app server under test.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set for e2e user setup");
  }
  pool ??= new Pool({ connectionString });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

let suffix: string | undefined;

/** Stable within one test run so fixtures can address each other's data. */
export function runSuffix(): string {
  suffix ??= Math.random().toString(36).slice(2, 8);
  return suffix;
}

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

/** Registers a user through Better Auth and verifies them in the database. */
export async function createVerifiedUser(
  request: APIRequestContext,
  name: string,
): Promise<TestUser> {
  const user: TestUser = {
    email: `${name.toLowerCase().replace(/\s+/g, "-")}-${runSuffix()}@e2e.orbit.test`,
    password: `orbit-e2e-${runSuffix()}`,
    name,
  };

  const response = await request.post("/api/auth/sign-up/email", {
    headers: authHeaders,
    data: { email: user.email, password: user.password, name: user.name },
  });
  if (response.status() !== 200) {
    throw new Error(`Sign-up failed: ${response.status()} ${await response.text()}`);
  }

  const result = await db().query(
    "update \"user\" set email_verified = true where email = $1",
    [user.email],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Verified-flip matched no user for ${user.email}`);
  }

  return user;
}

/** Returns the raw Better Auth session cookie value for a user. */
export async function signIn(
  request: APIRequestContext,
  user: TestUser,
): Promise<string> {
  const response = await request.post("/api/auth/sign-in/email", {
    headers: authHeaders,
    data: { email: user.email, password: user.password },
  });
  if (response.status() !== 200) {
    throw new Error(`Sign-in failed: ${response.status()} ${await response.text()}`);
  }

  const setCookie = response
    .headersArray()
    .find((header) => header.name.toLowerCase() === "set-cookie")?.value;
  const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
  if (!match) throw new Error("Sign-in response carried no session cookie");
  return match[1];
}

/** Points a browser page's context at a user's session cookie. */
export async function authenticatePage(
  page: Page,
  sessionCookie: string,
): Promise<void> {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: sessionCookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** The v1 API authenticates by session cookie header, like the browser. */
export function cookieHeader(sessionCookie: string): string {
  return `better-auth.session_token=${sessionCookie}`;
}

export interface MemberView {
  userId: string;
  name: string;
  role: "owner" | "editor" | "read-only";
}

/** Invite + accept over the v1 API; accept-invite UI is not built yet. */
export async function addMemberReadOnly(
  request: APIRequestContext,
  ownerSession: string,
  spaceId: string,
  member: TestUser,
  memberSession: string,
): Promise<void> {
  const invite = await request.post(`/api/v1/spaces/${spaceId}/invites`, {
    headers: { cookie: cookieHeader(ownerSession) },
    data: { email: member.email, role: "read-only" },
  });
  if (invite.status() !== 201) {
    throw new Error(`Invite failed: ${invite.status()} ${await invite.text()}`);
  }

  const accept = await request.post("/api/v1/invites/accept", {
    headers: { cookie: cookieHeader(memberSession) },
    data: { token: (await invite.json()).token },
  });
  if (accept.status() !== 201) {
    throw new Error(`Accept failed: ${accept.status()} ${await accept.text()}`);
  }
}

/** Owner session cookie of the space's Personal Space owner, for brevity. */
export async function spaceMembers(
  request: APIRequestContext,
  sessionCookie: string,
  spaceId: string,
): Promise<MemberView[]> {
  const response = await request.get(`/api/v1/spaces/${spaceId}/members`, {
    headers: { cookie: cookieHeader(sessionCookie) },
  });
  if (response.status() !== 200) {
    throw new Error(`Members fetch failed: ${response.status()}`);
  }
  return response.json();
}

/**
 * Directory row for a Space by its accessible name (heading), not page-wide
 * text. Avoids colliding with the Personal badge inside the same listitem.
 */
export function directoryRow(page: Page, spaceName: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: spaceName, exact: true }),
  });
}
