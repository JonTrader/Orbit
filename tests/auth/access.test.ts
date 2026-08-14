import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CREDENTIAL_PROVIDER_ID,
  hasFederatedAccount,
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
        hasFederatedAccount: false,
      }),
    ).toEqual({ allowed: false, redirectTo: VERIFY_EMAIL_PATH });
  });

  it("treats an OAuth user as verified even without a verified flag", () => {
    const input = session(false);
    expect(
      resolveAppAccess({ session: input, hasFederatedAccount: true }),
    ).toEqual({ allowed: true, session: input });
  });

  it("lets a verified user through", () => {
    const input = session(true);
    expect(resolveAppAccess({ session: input })).toEqual({
      allowed: true,
      session: input,
    });
  });
});

describe("hasFederatedAccount", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function addAccount(userId: string, providerId: string) {
    await testDb.insert(account).values({
      id: randomUUID(),
      accountId: `${providerId}-${userId}`,
      providerId,
      userId,
    });
  }

  it("is false for a user with only email/password credentials", async () => {
    const user = await createUser({ emailVerified: false });
    await addAccount(user.id, CREDENTIAL_PROVIDER_ID);

    expect(await hasFederatedAccount(testDb, user.id)).toBe(false);
  });

  it("is true once Google or Microsoft vouched for the address", async () => {
    const google = await createUser({ emailVerified: false });
    await addAccount(google.id, "google");
    const microsoft = await createUser({ emailVerified: false });
    await addAccount(microsoft.id, "microsoft");

    expect(await hasFederatedAccount(testDb, google.id)).toBe(true);
    expect(await hasFederatedAccount(testDb, microsoft.id)).toBe(true);
  });

  it("does not leak another user's provider account", async () => {
    const owner = await createUser();
    const other = await createUser();
    await addAccount(owner.id, "google");

    expect(await hasFederatedAccount(testDb, other.id)).toBe(false);
  });
});
