import {
  acquireTestDbLock,
  closeTestDb,
  migrateTestDb,
  releaseTestDbLock,
  resetTestSchema,
} from "./db";

/**
 * Holds a Postgres advisory lock for the full vitest run so a second CI job or
 * local `npm test` cannot drop the schema while tests are still executing.
 */
export async function setup(): Promise<() => Promise<void>> {
  await acquireTestDbLock();
  await resetTestSchema();
  await migrateTestDb();

  return async () => {
    await closeTestDb();
    await releaseTestDbLock();
  };
}
