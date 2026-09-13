import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "@/lib/email/mailer";

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

// Better Auth opens a database connection when the adapter is built; point it
// at the same Neon test branch the rest of the suite uses.
vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  const { testDb } = await import("../setup/db");
  return { ...actual, getDb: () => testDb };
});

type Auth = (typeof import("@/lib/auth/config"))["auth"];

let auth: Auth;

const user = {
  id: "user_1",
  name: "Jonathan Montoya",
  email: "member@orbit.test",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("better auth configuration", () => {
  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "orbit-test-secret-value-0123456789";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "https://preview.orbit.test";
    process.env.GOOGLE_CLIENT_ID ??= "google-test-client";
    process.env.GOOGLE_CLIENT_SECRET ??= "google-test-secret";
    process.env.MICROSOFT_CLIENT_ID ??= "microsoft-test-client";
    process.env.MICROSOFT_CLIENT_SECRET ??= "microsoft-test-secret";

    ({ auth } = await import("@/lib/auth/config"));
  });

  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it("requires a verified address before an email/password session (spec §3)", () => {
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(8);
  });

  it("uses database-backed rate limits and explicitly trusts the app origin", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
    expect(auth.options.trustedOrigins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://preview.orbit.test",
      ]),
    );
  });

  it("exposes id on the rateLimit drizzle table (adapter inserts it)", async () => {
    const { rateLimit } = await import("@/lib/db/schema");
    expect(rateLimit.id).toBeDefined();
    expect(rateLimit.key).toBeDefined();
    expect(rateLimit.count).toBeDefined();
    expect(rateLimit.lastRequest).toBeDefined();
  });

  it("marks federated accounts verified at account creation", async () => {
    const updateUser = vi.fn();
    const after = auth.options.databaseHooks?.account?.create?.after;

    await after?.(
      { userId: "user_1", providerId: "google" } as never,
      { context: { internalAdapter: { updateUser } } } as never,
    );
    await after?.(
      { userId: "user_1", providerId: "credential" } as never,
      { context: { internalAdapter: { updateUser } } } as never,
    );

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith("user_1", {
      emailVerified: true,
    });
  });

  it("offers email/password plus Google and Microsoft (ADR 0002)", () => {
    expect(Object.keys(auth.options.socialProviders ?? {}).sort()).toEqual([
      "google",
      "microsoft",
    ]);
  });

  it("sends a fresh link when an unverified user tries to sign in", () => {
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(auth.options.emailVerification?.sendOnSignIn).toBe(true);
  });

  it("routes verification mail through the Resend seam", async () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc";

    await auth.options.emailVerification?.sendVerificationEmail?.({
      user,
      url,
      token: "abc",
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: "Verify your email for Orbit",
        text: expect.stringContaining(url),
      }),
    );
  });

  it("routes password reset mail through a fragment URL", async () => {
    const url = "http://localhost:3000/api/auth/reset-password/def";

    await auth.options.emailAndPassword?.sendResetPassword?.({
      user,
      url,
      token: "def",
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: "Reset your Orbit password",
        text: expect.stringContaining(
          "http://localhost:3000/reset-password#token=def",
        ),
      }),
    );
  });
});
