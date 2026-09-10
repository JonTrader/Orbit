import { config } from "dotenv";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

export const TEST_DATABASE_URL_VAR = "DATABASE_URL_TEST";
export const TEST_DATABASE_CONFIRMATION_VAR =
  "DATABASE_URL_TEST_CONFIRMATION";
export const E2E_DATABASE_URL_VAR = "DATABASE_URL_E2E";
export const E2E_DATABASE_CONFIRMATION_VAR = "DATABASE_URL_E2E_CONFIRMATION";
export const DEDICATED_DATABASE_CONFIRMATION = "dedicated-neon-branch";

type DedicatedDatabaseGuard = {
  urlVar: string;
  confirmationVar: string;
  missing: string;
  confirmation: string;
  equalToApp: string;
  sameHost: string;
};

const TEST_DATABASE_GUARD: DedicatedDatabaseGuard = {
  urlVar: TEST_DATABASE_URL_VAR,
  confirmationVar: TEST_DATABASE_CONFIRMATION_VAR,
  missing:
    `${TEST_DATABASE_URL_VAR} is not set. Point it at a dedicated Neon test ` +
    `branch (never production) before running the db tests.`,
  confirmation:
    `${TEST_DATABASE_CONFIRMATION_VAR} must equal ` +
    `"${DEDICATED_DATABASE_CONFIRMATION}" before the test database can be used. ` +
    `This database is reset destructively and must be a dedicated Neon branch.`,
  equalToApp:
    `${TEST_DATABASE_URL_VAR} must not equal DATABASE_URL. The test run ` +
    `drops and recreates the public schema.`,
  sameHost:
    `${TEST_DATABASE_URL_VAR} must not use the same database host as ` +
    `DATABASE_URL. The test run drops and recreates the public schema.`,
};

const E2E_DATABASE_GUARD: DedicatedDatabaseGuard = {
  urlVar: E2E_DATABASE_URL_VAR,
  confirmationVar: E2E_DATABASE_CONFIRMATION_VAR,
  missing:
    `${E2E_DATABASE_URL_VAR} is not set. Point it at a dedicated Neon e2e ` +
    `branch (never production) before running Playwright.`,
  confirmation:
    `${E2E_DATABASE_CONFIRMATION_VAR} must equal ` +
    `"${DEDICATED_DATABASE_CONFIRMATION}" before the e2e database can be used. ` +
    `This must be a dedicated Neon branch, not DATABASE_URL.`,
  equalToApp: `${E2E_DATABASE_URL_VAR} must not equal DATABASE_URL.`,
  sameHost:
    `${E2E_DATABASE_URL_VAR} must not use the same database host as ` +
    `DATABASE_URL.`,
};

/**
 * Tests and Playwright each use a dedicated Neon branch. The explicit
 * confirmation prevents a copied production URL from being used silently.
 */
function resolveDedicatedDatabaseUrl(
  guard: DedicatedDatabaseGuard,
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env[guard.urlVar]?.trim();

  if (!url) {
    throw new Error(guard.missing);
  }

  if (env[guard.confirmationVar]?.trim() !== DEDICATED_DATABASE_CONFIRMATION) {
    throw new Error(guard.confirmation);
  }

  const appUrl = env.DATABASE_URL?.trim();
  if (appUrl && appUrl === url) {
    throw new Error(guard.equalToApp);
  }

  const appHost = appUrl ? databaseHost(appUrl) : null;
  const dedicatedHost = databaseHost(url);
  if (appHost && dedicatedHost && appHost === dedicatedHost) {
    throw new Error(guard.sameHost);
  }

  return url;
}

export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveDedicatedDatabaseUrl(TEST_DATABASE_GUARD, env);
}

export function resolveE2eDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveDedicatedDatabaseUrl(E2E_DATABASE_GUARD, env);
}

function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
