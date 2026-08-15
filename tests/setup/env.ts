import { config } from "dotenv";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

export const TEST_DATABASE_URL_VAR = "DATABASE_URL_TEST";
export const TEST_DATABASE_CONFIRMATION_VAR =
  "DATABASE_URL_TEST_CONFIRMATION";
const TEST_DATABASE_CONFIRMATION = "dedicated-neon-branch";

/**
 * Tests run against a real Neon branch and reset its schema. The explicit
 * confirmation prevents a copied production URL from being used silently.
 */
export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env[TEST_DATABASE_URL_VAR]?.trim();

  if (!url) {
    throw new Error(
      `${TEST_DATABASE_URL_VAR} is not set. Point it at a dedicated Neon test ` +
        `branch (never production) before running the db tests.`,
    );
  }

  if (env[TEST_DATABASE_CONFIRMATION_VAR]?.trim() !== TEST_DATABASE_CONFIRMATION) {
    throw new Error(
      `${TEST_DATABASE_CONFIRMATION_VAR} must equal ` +
        `\"${TEST_DATABASE_CONFIRMATION}\" before the test database can be used. ` +
        `This database is reset destructively and must be a dedicated Neon branch.`,
    );
  }

  const appUrl = env.DATABASE_URL?.trim();
  if (appUrl && appUrl === url) {
    throw new Error(
      `${TEST_DATABASE_URL_VAR} must not equal DATABASE_URL. The test run ` +
        `drops and recreates the public schema.`,
    );
  }

  const appHost = appUrl ? databaseHost(appUrl) : null;
  const testHost = databaseHost(url);
  if (appHost && testHost && appHost === testHost) {
    throw new Error(
      `${TEST_DATABASE_URL_VAR} must not use the same database host as ` +
        `DATABASE_URL. The test run drops and recreates the public schema.`,
    );
  }

  return url;
}

function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
