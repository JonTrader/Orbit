import { Pool } from "@neondatabase/serverless";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import {
  hashInviteToken,
  newInviteBearerToken,
} from "../lib/invites/token";

import { bootstrapE2eDatabaseUrl } from "./env";

export { newInviteBearerToken };

/**
 * E2E helpers: real verified users, real Spaces, real cookies. Users are
 * created through Better Auth's own HTTP endpoints and then verified by a
 * direct database update, because the verification email is not delivered
 * under test (Playwright clears Resend env for the app server).
 *
 * Invite accept links use bearer tokens that are never stored - only SHA-256
 * digests. Pin a known raw token onto the pending Invite row so Playwright
 * can open `/accept-invite` without reading an inbox.
 */

bootstrapE2eDatabaseUrl();

/** Matches playwright.config baseURL and BETTER_AUTH_URL default. */
const AUTH_ORIGIN =
  process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";

/** Better Auth rejects cookie-bearing auth POSTs without a trusted Origin. */
const authHeaders = { origin: AUTH_ORIGIN };

let pool: Pool | undefined;

function db(): Pool {
  // DATABASE_URL only - bootstrapE2eDatabaseUrl() already redirected it to
  // DATABASE_URL_E2E, matching the app server under test.
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

/**
 * Direct read-only membership insert for suites that only need a Viewer.
 * Keeps older E2E specs independent of Invite email delivery.
 */
export async function addMemberReadOnly(
  _request: APIRequestContext,
  _ownerSession: string,
  spaceId: string,
  member: TestUser,
  _memberSession: string,
): Promise<void> {
  const userResult = await db().query(
    'select id from "user" where email = $1',
    [member.email],
  );
  const userId = userResult.rows[0]?.id as string | undefined;
  if (!userId) {
    throw new Error(`No user found for ${member.email}`);
  }

  await db().query(
    `insert into space_member (space_id, user_id, role)
     values ($1, $2, 'read-only')
     on conflict on constraint space_member_space_user_unique do nothing`,
    [spaceId, userId],
  );
}

export interface PendingInviteRow {
  id: string;
  email: string;
  role: "editor" | "read-only";
  expiresAt: Date;
}

/** Looks up the pending Invite for a Space + email (case-insensitive). */
export async function findPendingInvite(
  spaceId: string,
  email: string,
): Promise<PendingInviteRow | null> {
  const result = await db().query(
    `select id, email, role, expires_at as "expiresAt"
     from invite
     where space_id = $1
       and lower(email) = lower($2)
       and accepted_at is null
     limit 1`,
    [spaceId, email],
  );
  const row = result.rows[0] as
    | { id: string; email: string; role: string; expiresAt: Date }
    | undefined;
  if (!row) return null;
  if (row.role !== "editor" && row.role !== "read-only") {
    throw new Error(`Unexpected Invite role ${row.role}`);
  }
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: new Date(row.expiresAt),
  };
}

/** Overwrites token_digest so tests can open a known accept URL. */
export async function setInviteBearerToken(
  inviteId: string,
  rawToken: string,
): Promise<void> {
  const result = await db().query(
    `update invite
     set token_digest = $1, updated_at = now()
     where id = $2`,
    [hashInviteToken(rawToken), inviteId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`setInviteBearerToken matched no Invite ${inviteId}`);
  }
}

/**
 * After ShareBar/API invite (no inbox under test), pin a known bearer onto
 * the pending row and return its id.
 */
export async function pinInviteBearerToken(
  spaceId: string,
  email: string,
  rawToken: string,
): Promise<string> {
  const pending = await findPendingInvite(spaceId, email);
  if (!pending) {
    throw new Error(`No pending Invite for ${email} in Space ${spaceId}`);
  }
  await setInviteBearerToken(pending.id, rawToken);
  return pending.id;
}

/** Forces a pending Invite into the expired preview state. */
export async function expirePendingInvite(inviteId: string): Promise<void> {
  const result = await db().query(
    `update invite
     set expires_at = now() - interval '1 hour', updated_at = now()
     where id = $1 and accepted_at is null`,
    [inviteId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`expirePendingInvite matched no Invite ${inviteId}`);
  }
}

/** Marks an address verified the same way createVerifiedUser does. */
export async function markEmailVerified(email: string): Promise<void> {
  const result = await db().query(
    'update "user" set email_verified = true where email = $1',
    [email],
  );
  if (result.rowCount !== 1) {
    throw new Error(`markEmailVerified matched no user for ${email}`);
  }
}

/** Clears verification so an existing session is treated as unverified. */
export async function markEmailUnverified(email: string): Promise<void> {
  const result = await db().query(
    'update "user" set email_verified = false where email = $1',
    [email],
  );
  if (result.rowCount !== 1) {
    throw new Error(`markEmailUnverified matched no user for ${email}`);
  }
}

/** Accept-invite path for a known bearer (query-encoded). */
export function acceptInviteUrl(rawToken: string): string {
  const params = new URLSearchParams({ token: rawToken });
  return `/accept-invite?${params.toString()}`;
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
