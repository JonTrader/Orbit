import { config } from "dotenv";

import { resolveTestDatabaseUrl } from "../tests/setup/env";

export interface E2eEnvBootstrap {
  /** Connection string shared by the app under test and e2e helpers. */
  databaseUrl: string;
  /** True when the run targets DATABASE_URL_TEST (local redirect or CI). */
  usesTestBranch: boolean;
}

let bootstrapped: E2eEnvBootstrap | undefined;

/**
 * Load `.env.test` / `.env`, then point `DATABASE_URL` at the dedicated test
 * branch when `DATABASE_URL_TEST` is configured. The app server and direct DB
 * helpers must share one connection string or sign-up and verification diverge.
 */
export function bootstrapE2eDatabaseUrl(): E2eEnvBootstrap {
  if (bootstrapped) {
    return bootstrapped;
  }

  config({ path: ".env.test", quiet: true });
  config({ path: ".env", quiet: true });

  const testUrl = process.env.DATABASE_URL_TEST?.trim();
  const appUrl = process.env.DATABASE_URL?.trim();

  if (testUrl) {
    // CI maps both vars to the same secret without the local confirmation marker.
    if (appUrl === testUrl) {
      bootstrapped = { databaseUrl: testUrl, usesTestBranch: true };
      return bootstrapped;
    }

    const resolved = resolveTestDatabaseUrl();
    process.env.DATABASE_URL = resolved;
    bootstrapped = { databaseUrl: resolved, usesTestBranch: true };
    return bootstrapped;
  }

  if (!appUrl) {
    throw new Error(
      "DATABASE_URL must be set for e2e. Prefer DATABASE_URL_TEST (see README) " +
        "so runs stay on the dedicated Neon test branch.",
    );
  }

  bootstrapped = { databaseUrl: appUrl, usesTestBranch: false };
  return bootstrapped;
}
