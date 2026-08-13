import { closeTestDb, migrateTestDb, resetTestSchema } from "./db";

/** Every run starts from an empty Neon branch so migrations are proven clean. */
export async function setup(): Promise<void> {
  await resetTestSchema();
  await migrateTestDb();
  await closeTestDb();
}
