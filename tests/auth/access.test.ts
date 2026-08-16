import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CREDENTIAL_PROVIDER_ID,
  hasCredentialAccount,
  resolveAppAccess,
} from "@/lib/auth-access";
import { SIGN_IN_PATH, VERIFY_EMAIL_PATH } from "@/lib/auth-paths";
import { account } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

function session(emailVerified: boolean) {
  return { user: { id: "u_1", emailVerified } };
}

describe("resolveAppAccess", () => {
  it("sends anonymous visitors to sign in", () => {
    expect(resolveAppAccess({ session: null })).toEqual({
      allowed: false,
      redirectTo: SIGN_IN_PATH,
    });
  });

  it("blocks an unverified email/password user", () => {
    expect(
      resolveAppAccess({
        session: session(false),
      }),
    ).toEqual({ allowed: false, redirectTo: VERIFY_EMAIL_PATH });
  });

  it("allows an OAuth user after the account hook marks it verified", () => {
    expect(resolveAppAccess({ session: { user: { emailVerified: true } } })).toEqual({
      allowed: true,
      session: { user: { emailVerified: true } },
    });
  });

  it("lets a verified user through", () => {
    const input = session(true);
    expect(resolveAppAccess({ session: input })).toEqual({
      allowed: true,
      session: input,
    });
  });
});

describe("hasCredentialAccount", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  it("is true for an email/password account", async () => {
    const user = await createUser();
    await testDb.insert(account).values({
      id: randomUUID(),
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      userId: user.id,
    });

    expect(await hasCredentialAccount(testDb, user.id)).toBe(true);
  });

  it("is false for an OAuth-only account", async () => {
    const user = await createUser();
    await testDb.insert(account).values({
      id: randomUUID(),
      accountId: "google-account",
      providerId: "google",
      userId: user.id,
    });

    expect(await hasCredentialAccount(testDb, user.id)).toBe(false);
  });
});
