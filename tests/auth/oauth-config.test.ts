import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  const { testDb } = await import("../setup/db");
  return { ...actual, getDb: () => testDb };
});

type Auth = (typeof import("@/lib/auth/config"))["auth"];

let auth: Auth;

describe("OAuth configuration", () => {
  beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "orbit-test-secret-value-0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");

    ({ auth } = await import("@/lib/auth/config"));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("does not register providers whose credentials are missing", () => {
    expect(Object.keys(auth.options.socialProviders ?? {})).toEqual([]);
  });
});
