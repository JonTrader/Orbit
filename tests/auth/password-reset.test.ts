import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RESET_PASSWORD_PATH } from "@/lib/auth-paths";
import { session, verification } from "@/lib/db/schema";
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

/** The one answer the endpoint gives, account or no account. */
const GENERIC_ANSWER = {
  status: true,
  message:
    "If this email exists in our system, check your email for the reset link",
};

/** The link Better Auth handed to the mailer for the most recent send. */
function lastEmailedUrl(): string {
  const last = vi.mocked(sendEmail).mock.calls.at(-1)?.[0];
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

/** Reset tokens ride in the path, not the query: `/reset-password/<token>`. */
function lastEmailedResetToken(): string {
  const url = new URL(lastEmailedUrl());
  const match = url.pathname.match(/\/reset-password\/([^/]+)$/);
  if (!match) throw new Error(`Not a reset link: ${url.href}`);
  return match[1];
}

/**
 * A user with a verified address and a credential account, made the way the
 * app makes one - the reset path reads the account row Better Auth writes.
 */
async function signUpVerifiedUser(): Promise<void> {
  await auth.api.signUpEmail({ body: CREDENTIALS });
  const token = new URL(lastEmailedUrl()).searchParams.get("token");
  if (!token) throw new Error("No verification token in email");
  await auth.api.verifyEmail({ query: { token } });
  vi.mocked(sendEmail).mockClear();
}

/** What the forgot-password form sends. */
async function requestReset(email: string) {
  return auth.api.requestPasswordReset({
    body: { email, redirectTo: RESET_PASSWORD_PATH },
  });
}

async function requestResetToken(): Promise<string> {
  await requestReset(CREDENTIALS.email);
  return lastEmailedResetToken();
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

describe("password reset", () => {
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

  it("emails one reset link to the account holder, and the link carries its token to the form", async () => {
    await signUpVerifiedUser();

    expect(await requestReset(CREDENTIALS.email)).toEqual(GENERIC_ANSWER);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(CREDENTIALS.email);
    expect(mail.subject).toBe("Reset your Orbit password");

    const link = new URL(lastEmailedUrl());
    const token = lastEmailedResetToken();
    expect(link.pathname).toBe(`/api/auth/reset-password/${token}`);

    // Clicking the button lands on the app's reset page with the token in hand.
    const response = await auth.handler(
      new Request(lastEmailedHref(), { method: "GET" }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${link.origin}${RESET_PASSWORD_PATH}?token=${token}`,
    );
  });

  it("sets a password the user can sign in with", async () => {
    await signUpVerifiedUser();
    const token = await requestResetToken();

    expect(
      await auth.api.resetPassword({
        body: { newPassword: NEW_PASSWORD, token },
      }),
    ).toEqual({ status: true });

    const headers = await signInWithCookie(NEW_PASSWORD);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      CREDENTIALS.email,
    );

    // The reset mail is still the only send: the new password signs in
    // outright rather than tripping the unverified-address detour.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("stops the old password working the moment the reset completes", async () => {
    await signUpVerifiedUser();
    const token = await requestResetToken();
    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(
      await failureOf(
        auth.api.signInEmail({
          body: { email: CREDENTIALS.email, password: CREDENTIALS.password },
        }),
      ),
    ).toEqual({
      status: "UNAUTHORIZED",
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
  });

  it("spends a reset token on first use, so a replayed link changes nothing", async () => {
    await signUpVerifiedUser();
    const token = await requestResetToken();
    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    expect(
      await failureOf(
        auth.api.resetPassword({
          body: { newPassword: "orbit-replayed-password", token },
        }),
      ),
    ).toEqual({ status: "BAD_REQUEST", code: "INVALID_TOKEN" });

    // The replay did not take: the password from the first reset still works.
    const headers = await signInWithCookie(NEW_PASSWORD);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      CREDENTIALS.email,
    );
  });

  it("resets nothing from a tampered token", async () => {
    await signUpVerifiedUser();
    const token = await requestResetToken();

    expect(
      await failureOf(
        auth.api.resetPassword({
          body: { newPassword: NEW_PASSWORD, token: `${token}tampered` },
        }),
      ),
    ).toEqual({ status: "BAD_REQUEST", code: "INVALID_TOKEN" });

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

    const headers = await signInWithCookie(CREDENTIALS.password);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      CREDENTIALS.email,
    );
  });

  it("refuses a link that sat in the inbox past its hour", async () => {
    await signUpVerifiedUser();
    const token = await requestResetToken();

    const expired = await testDb
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(verification.identifier, `reset-password:${token}`))
      .returning();
    expect(expired).toHaveLength(1);

    expect(
      await failureOf(
        auth.api.resetPassword({
          body: { newPassword: NEW_PASSWORD, token },
        }),
      ),
    ).toEqual({ status: "BAD_REQUEST", code: "INVALID_TOKEN" });

    const headers = await signInWithCookie(CREDENTIALS.password);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      CREDENTIALS.email,
    );
  });

  it("answers an unknown address exactly as it answers a real one", async () => {
    await signUpVerifiedUser();

    const known = await requestReset(CREDENTIALS.email);
    const unknown = await requestReset("nobody@orbit.test");

    // Same body both times: the response cannot be used to enumerate accounts.
    expect(unknown).toEqual(known);
    expect(unknown).toEqual(GENERIC_ANSWER);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(CREDENTIALS.email);
  });

  it("ends the sessions the old password opened", async () => {
    await signUpVerifiedUser();
    const headers = await signInWithCookie(CREDENTIALS.password);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(
      CREDENTIALS.email,
    );

    const token = await requestResetToken();
    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });

    // A reset is how someone takes an account back, so whoever was signed in
    // with the old password is signed out (revokeSessionsOnPasswordReset).
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect(await testDb.select().from(session)).toHaveLength(0);
  });
});
