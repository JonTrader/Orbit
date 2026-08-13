import { config } from "dotenv";

config({ path: ".env.test", quiet: true });
config({ path: ".env", quiet: true });

export const TEST_DATABASE_URL_VAR = "DATABASE_URL_TEST";

/**
 * Tests run against a real Neon branch and reset its schema, so an unset or
 * production-pointing variable must fail loudly rather than silently pass.
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

  const appUrl = env.DATABASE_URL?.trim();
  if (appUrl && appUrl === url) {
    throw new Error(
      `${TEST_DATABASE_URL_VAR} must not equal DATABASE_URL. The test run ` +
        `drops and recreates the public schema.`,
    );
  }

  return url;
}
