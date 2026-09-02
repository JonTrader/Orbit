import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { createDbClient, type DbClient } from "@/lib/db/client";

import { resolveTestDatabaseUrl } from "./env";

export const MIGRATIONS_FOLDER = "drizzle";

/** Serializes destructive schema work across CI jobs and local runs. */
export const TEST_DB_LOCK_KEY = 0x4f524249;

const client = createDbClient(resolveTestDatabaseUrl());

export const testDb = client.db;

let closed = false;

let lockClient: DbClient | undefined;

/** Blocks until this runner owns the shared Neon test branch. */
export async function acquireTestDbLock(): Promise<void> {
  if (!lockClient) {
    lockClient = createDbClient(resolveTestDatabaseUrl());
  }
  await lockClient.db.execute(
    sql`select pg_advisory_lock(${TEST_DB_LOCK_KEY})`,
  );
}

/** Releases the branch lock for the next runner. */
export async function releaseTestDbLock(): Promise<void> {
  if (!lockClient) return;
  await lockClient.db.execute(
    sql`select pg_advisory_unlock(${TEST_DB_LOCK_KEY})`,
  );
  await lockClient.close();
  lockClient = undefined;
}

export async function migrateTestDb(): Promise<void> {
  await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Returns the branch to a pre-migration state so a clean apply can be proven. */
export async function resetTestSchema(): Promise<void> {
  await testDb.execute(sql`drop schema if exists public cascade`);
  await testDb.execute(sql`drop schema if exists drizzle cascade`);
  await testDb.execute(sql`create schema public`);
}

export async function truncateAll(): Promise<void> {
  const result = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows.map((r) => `"public"."${r.tablename}"`);
  if (tables.length === 0) return;
  await testDb.execute(
    sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`),
  );
}

export async function listPublicTables(): Promise<string[]> {
  const result = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return result.rows.map((r) => r.tablename);
}

export async function countAppliedMigrations(): Promise<number> {
  const result = await testDb.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle."__drizzle_migrations"`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function closeTestDb(): Promise<void> {
  if (closed) return;
  closed = true;
  await client.close();
}
