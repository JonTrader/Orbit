import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hasFederatedAccount, resolveAppAccess } from "@/lib/auth-access";
import { VERIFY_EMAIL_PATH } from "@/lib/auth-paths";
import { section, session, user } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { ensurePersonalSpace } from "@/lib/onboarding";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  const { testDb: db } = await import("../setup/db");
  return { ...actual, getDb: () => db };
});

type Auth = (typeof import("@/lib/auth"))["auth"];

let auth: Auth;

const CREDENTIALS = {
  name: "Jonathan Montoya",
  email: "jon@orbit.test",
  password: "orbit-test-password",
};

/** The link Better Auth handed to the mailer for the most recent send. */
function lastEmailedUrl(): string {
  const calls = vi.mocked(sendEmail).mock.calls;
  const last = calls.at(-1)?.[0];
  if (!last) throw new Error("No email was sent");
  const match = last.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No link in email: ${last.text}`);
  return match[0];
}

/** The button link as a mail client would request it, entities decoded. */
function lastEmailedHref(): string {
  const last = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
  if (!last) throw new Error("No email was sent");
  const match = last.html.match(/href="([^"]+)"/);
  if (!match) throw new Error("No link in email html");
  return match[1].replace(/&amp;/g, "&");
}

async function readUser(email: string) {
  const [row] = await testDb.select().from(user).where(eq(user.email, email));
  return row;
}

async function countSessions(userId: string): Promise<number> {
  const rows = await testDb
    .select()
    .from(session)
    .where(eq(session.userId, userId));
  return rows.length;
}

describe("email/password sign-up", () => {
  beforeAll(async () => {
    await migrateTestDb();
    process.env.BETTER_AUTH_SECRET ??= "orbit-test-secret-value-0123456789";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    ({ auth } = await import("@/lib/auth"));
  });

  beforeEach(async () => {
    await truncateAll();
    vi.mocked(sendEmail).mockClear();
  });

  it("emails a verification link and withholds the session until it is used", async () => {
    const result = await auth.api.signUpEmail({ body: CREDENTIALS });

    // No session token: the address has to be verified first (spec §3).
    expect(result.token).toBeNull();

    const created = await readUser(CREDENTIALS.email);
    expect(created.emailVerified).toBe(false);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(CREDENTIALS.email);
    expect(lastEmailedUrl()).toContain("/api/auth/verify-email?token=");

    // The gate keeps that user out of the app shell.
    const access = resolveAppAccess({
      session: { user: created },
      hasFederatedAccount: await hasFederatedAccount(testDb, created.id),
    });
    expect(access).toEqual({
      allowed: false,
      redirectTo: VERIFY_EMAIL_PATH,
    });
  });

  it("opens the app and onboards a Personal Space once the link is used", async () => {
    await auth.api.signUpEmail({ body: CREDENTIALS });
    const token = new URL(lastEmailedUrl()).searchParams.get("token");
    expect(token).toBeTruthy();

    await auth.api.verifyEmail({ query: { token: token as string } });

    const verified = await readUser(CREDENTIALS.email);
    expect(verified.emailVerified).toBe(true);

    const access = resolveAppAccess({ session: { user: verified } });
    expect(access.allowed).toBe(true);

    const { spaceId, created } = await ensurePersonalSpace(testDb, {
      userId: verified.id,
      timezone: "America/Chicago",
    });
    expect(created).toBe(true);

    const sections = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, spaceId))
      .orderBy(section.sortOrder);
    expect(sections.map((s) => s.kind)).toEqual(["daily", "monthlies"]);
  });

  it("accepts the emailed button link, callbackURL and all", async () => {
    await auth.api.signUpEmail({ body: { ...CREDENTIALS, callbackURL: "/" } });

    // Percent-encoding the href a second time made callbackURL=%252F and the
    // route answered 403 while the plain-text link still worked.
    const href = lastEmailedHref();
    expect(href).toContain("callbackURL=%2F");

    const response = await auth.handler(new Request(href, { method: "GET" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect((await readUser(CREDENTIALS.email)).emailVerified).toBe(true);
  });

  it("verifies nobody from a forged token, and a spent link is inert", async () => {
    await auth.api.signUpEmail({ body: CREDENTIALS });
    const token = new URL(lastEmailedUrl()).searchParams.get("token") as string;

    await expect(
      auth.api.verifyEmail({ query: { token: `${token}tampered` } }),
    ).rejects.toThrow();
    expect((await readUser(CREDENTIALS.email)).emailVerified).toBe(false);

    await auth.api.verifyEmail({ query: { token } });
    const verified = await readUser(CREDENTIALS.email);
    const signedIn = await countSessions(verified.id);

    // Replaying the same link cannot hand back another user or session.
    const replay = await auth.api.verifyEmail({ query: { token } });
    expect(replay).toEqual({ status: true, user: null });
    expect(await countSessions(verified.id)).toBe(signedIn);
  });
});
