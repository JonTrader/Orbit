import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CREDENTIAL_PROVIDER_ID } from "@/lib/auth-access";
import { account, session } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";

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
  password: "orbit-old-password",
};

const NEW_PASSWORD = "orbit-new-password";

/** The link Better Auth handed to the mailer for the most recent send. */
function lastEmailedUrl(): string {
  const last = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
  if (!last) throw new Error("No email was sent");
  const match = last.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No link in email: ${last.text}`);
  return match[0];
}

async function signUpVerifiedUser(): Promise<void> {
  await auth.api.signUpEmail({ body: CREDENTIALS });
  const token = new URL(lastEmailedUrl()).searchParams.get("token");
  if (!token) throw new Error("No verification token in email");
  await auth.api.verifyEmail({ query: { token } });
  vi.mocked(sendEmail).mockClear();
}

/** Signs in and hands back the cookie a browser would carry afterwards. */
async function signInWithCookie(password: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: CREDENTIALS.email, password },
    returnHeaders: true,
  });
  const cookies = headers.getSetCookie().map((c) => c.split(";")[0]);
  if (cookies.length === 0) throw new Error("Sign-in set no session cookie");
  return new Headers({ cookie: cookies.join("; ") });
}

/** The status and code from a rejected `auth.api` call. */
async function failureOf(
  call: Promise<unknown>,
): Promise<{ status: unknown; code: unknown }> {
  try {
    await call;
  } catch (error) {
    const failure = error as { status?: unknown; body?: { code?: unknown } };
    return { status: failure.status, code: failure.body?.code };
  }
  throw new Error("Expected the call to fail, but it resolved");
}

describe("change password", () => {
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

  it("sets a password the user can sign in with", async () => {
    await signUpVerifiedUser();
    const headers = await signInWithCookie(CREDENTIALS.password);

    expect(
      await auth.api.changePassword({
        body: {
          currentPassword: CREDENTIALS.password,
          newPassword: NEW_PASSWORD,
          revokeOtherSessions: true,
        },
        headers,
      }),
    ).toMatchObject({ user: { email: CREDENTIALS.email } });

    const signedIn = await signInWithCookie(NEW_PASSWORD);
    expect((await auth.api.getSession({ headers: signedIn }))?.user.email).toBe(
      CREDENTIALS.email,
    );
  });

  it("rejects a wrong current password and leaves the old one working", async () => {
    await signUpVerifiedUser();
    const headers = await signInWithCookie(CREDENTIALS.password);

    expect(
      await failureOf(
        auth.api.changePassword({
          body: {
            currentPassword: "not-the-password",
            newPassword: NEW_PASSWORD,
            revokeOtherSessions: true,
          },
          headers,
        }),
      ),
    ).toEqual({ status: "BAD_REQUEST", code: "INVALID_PASSWORD" });

    expect(
      await failureOf(
        auth.api.signInEmail({
          body: { email: CREDENTIALS.email, password: NEW_PASSWORD },
        }),
      ),
    ).toEqual({
      status: "UNAUTHORIZED",
      code: "INVALID_EMAIL_OR_PASSWORD",
    });

    const stillWorks = await signInWithCookie(CREDENTIALS.password);
    expect(
      (await auth.api.getSession({ headers: stillWorks }))?.user.email,
    ).toBe(CREDENTIALS.email);
  });

  it("refuses an unauthenticated call", async () => {
    await signUpVerifiedUser();

    expect(
      await failureOf(
        auth.api.changePassword({
          body: {
            currentPassword: CREDENTIALS.password,
            newPassword: NEW_PASSWORD,
            revokeOtherSessions: true,
          },
        }),
      ),
    ).toEqual({ status: "UNAUTHORIZED", code: "UNAUTHORIZED" });
  });

  it("rejects a change when the account has no password", async () => {
    await signUpVerifiedUser();
    const headers = await signInWithCookie(CREDENTIALS.password);

    await testDb
      .delete(account)
      .where(eq(account.providerId, CREDENTIAL_PROVIDER_ID));

    expect(
      await failureOf(
        auth.api.changePassword({
          body: {
            currentPassword: CREDENTIALS.password,
            newPassword: NEW_PASSWORD,
            revokeOtherSessions: true,
          },
          headers,
        }),
      ),
    ).toEqual({
      status: "BAD_REQUEST",
      code: "CREDENTIAL_ACCOUNT_NOT_FOUND",
    });
  });

  it("ends other sessions when revokeOtherSessions is true", async () => {
    await signUpVerifiedUser();
    // Verification auto-signs in; clear that so the two cookies below are the
    // only sessions under test.
    await testDb.delete(session);

    const first = await signInWithCookie(CREDENTIALS.password);
    const second = await signInWithCookie(CREDENTIALS.password);

    expect((await auth.api.getSession({ headers: first }))?.user.email).toBe(
      CREDENTIALS.email,
    );
    expect((await auth.api.getSession({ headers: second }))?.user.email).toBe(
      CREDENTIALS.email,
    );
    expect(await testDb.select().from(session)).toHaveLength(2);

    const { headers: responseHeaders } = await auth.api.changePassword({
      body: {
        currentPassword: CREDENTIALS.password,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      },
      headers: first,
      returnHeaders: true,
    });

    // Other sessions are gone; the caller gets a fresh session cookie.
    expect(await auth.api.getSession({ headers: second })).toBeNull();
    expect(await testDb.select().from(session)).toHaveLength(1);

    const cookies = responseHeaders.getSetCookie().map((c) => c.split(";")[0]);
    expect(cookies.length).toBeGreaterThan(0);
    const refreshed = new Headers({ cookie: cookies.join("; ") });
    expect(
      (await auth.api.getSession({ headers: refreshed }))?.user.email,
    ).toBe(CREDENTIALS.email);
  });
});
