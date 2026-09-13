import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countAppliedMigrations,
  listPublicTables,
  MIGRATIONS_FOLDER,
  migrateTestDb,
  resetTestSchema,
  testDb,
} from "../setup/db";

const MONTHLY_BODY_MIGRATION = readFileSync(
  resolve(MIGRATIONS_FOLDER, "0007_steep_millenium_guard.sql"),
  "utf8",
);

const ORBIT_TABLES = [
  "space",
  "space_member",
  "section",
  "task",
  "monthly",
  "note",
  "invite",
  "notification_preference",
  "notification_log",
];

const BETTER_AUTH_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "rate_limit",
];

const EXPECTED_TRIGGERS = {
  section_kind_immutable_trigger: "section",
  user_updated_at_trigger: "user",
  session_updated_at_trigger: "session",
  account_updated_at_trigger: "account",
  verification_updated_at_trigger: "verification",
  space_updated_at_trigger: "space",
  space_member_updated_at_trigger: "space_member",
  section_updated_at_trigger: "section",
  task_updated_at_trigger: "task",
  monthly_updated_at_trigger: "monthly",
  note_updated_at_trigger: "note",
  invite_updated_at_trigger: "invite",
  notification_preference_updated_at_trigger: "notification_preference",
} as const;

describe("migrations", () => {
  let appliedAfterFirstRun: number;

  beforeAll(async () => {
    await resetTestSchema();
    await migrateTestDb();
    appliedAfterFirstRun = await countAppliedMigrations();
  });

  it("applies cleanly to an empty database", async () => {
    const tables = await listPublicTables();
    for (const table of ORBIT_TABLES) {
      expect(tables, `missing table ${table}`).toContain(table);
    }
    expect(appliedAfterFirstRun).toBeGreaterThan(0);
  });

  it("backfills existing Monthly rows with an empty body", async () => {
    await testDb.execute(
      sql.raw('drop schema if exists "monthly_body_migration_test" cascade'),
    );
    await testDb.execute(sql.raw('create schema "monthly_body_migration_test"'));

    try {
      await testDb.transaction(async (tx) => {
        await tx.execute(
          sql.raw('set local search_path to "monthly_body_migration_test"'),
        );
        await tx.execute(
          sql.raw(
            'create table "monthly" ("id" uuid primary key, "title" text not null)',
          ),
        );
        await tx.execute(
          sql.raw(
            `insert into "monthly" ("id", "title") values ('00000000-0000-0000-0000-000000000001', 'Existing')`,
          ),
        );

        await tx.execute(sql.raw(MONTHLY_BODY_MIGRATION));

        const result = await tx.execute<{ body: string }>(
          sql.raw(
            `select "body" from "monthly" where "id" = '00000000-0000-0000-0000-000000000001'`,
          ),
        );
        expect(result.rows).toEqual([{ body: "" }]);
      });
    } finally {
      await testDb.execute(
        sql.raw('drop schema if exists "monthly_body_migration_test" cascade'),
      );
    }
  });

  it("creates the Better Auth tables", async () => {
    const tables = await listPublicTables();
    for (const table of BETTER_AUTH_TABLES) {
      expect(tables, `missing table ${table}`).toContain(table);
    }
  });

  it("gives rate_limit an id primary key", async () => {
    const columns = await testDb.execute<{
      columnName: string;
      isNullable: string;
    }>(sql`
      select column_name as "columnName", is_nullable as "isNullable"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'rate_limit'
    `);
    expect(columns.rows).toEqual(
      expect.arrayContaining([
        { columnName: "id", isNullable: "NO" },
        { columnName: "key", isNullable: "NO" },
        { columnName: "count", isNullable: "NO" },
        { columnName: "last_request", isNullable: "NO" },
      ]),
    );

    const primaryKey = await testDb.execute<{ columnName: string }>(sql`
      select kcu.column_name as "columnName"
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'rate_limit'
        and tc.constraint_type = 'PRIMARY KEY'
    `);
    expect(primaryKey.rows).toEqual([{ columnName: "id" }]);
  });

  it("creates the Section and updated_at triggers", async () => {
    const result = await testDb.execute<{
      triggerName: string;
      tableName: string;
    }>(sql`
      select
        trigger_name as "triggerName",
        event_object_table as "tableName"
      from information_schema.triggers
      where trigger_schema = 'public'
    `);

    for (const [triggerName, tableName] of Object.entries(EXPECTED_TRIGGERS)) {
      expect(result.rows).toContainEqual({ triggerName, tableName });
    }
  });

  it("is a no-op when migrations run a second time", async () => {
    await expect(migrateTestDb()).resolves.not.toThrow();
    expect(await countAppliedMigrations()).toBe(appliedAfterFirstRun);
    const tables = await listPublicTables();
    for (const table of [...ORBIT_TABLES, ...BETTER_AUTH_TABLES]) {
      expect(tables).toContain(table);
    }
  });
});
