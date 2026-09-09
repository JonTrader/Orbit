import { sql } from "drizzle-orm";

import { createDbClient, type DbClient } from "@/lib/db/client";

import { TEST_DB_LOCK_KEY } from "../tests/setup/db-lock-key";
import { resolveTestDatabaseUrl } from "../tests/setup/env";

let lockClient: DbClient | undefined;

function resolveE2eLockDatabaseUrl(): string {
  return resolveTestDatabaseUrl({
    ...process.env,
    // Playwright injects DATABASE_URL for the app server, but the harness
    // should still validate against the original DATABASE_URL_TEST settings.
    DATABASE_URL: undefined,
  });
}

async function acquireE2eTestDbLock(): Promise<void> {
  if (!lockClient) {
    lockClient = createDbClient(resolveE2eLockDatabaseUrl());
  }
  await lockClient.db.execute(sql`select pg_advisory_lock(${TEST_DB_LOCK_KEY})`);
}

async function releaseE2eTestDbLock(): Promise<void> {
  if (!lockClient) return;
  await lockClient.db.execute(sql`select pg_advisory_unlock(${TEST_DB_LOCK_KEY})`);
  await lockClient.close();
  lockClient = undefined;
}

/**
 * Hold the shared Neon test-branch advisory lock for the full Playwright run
 * so local or CI e2e runs cannot overlap with Vitest or another e2e process.
 */
export default async function lockTestDatabase(): Promise<() => Promise<void>> {
  await acquireE2eTestDbLock();

  return async () => {
    await releaseE2eTestDbLock();
  };
}
