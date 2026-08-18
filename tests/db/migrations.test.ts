import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countAppliedMigrations,
  listPublicTables,
  migrateTestDb,
  resetTestSchema,
  testDb,
} from "../setup/db";

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

  it("creates the Better Auth tables", async () => {
    const tables = await listPublicTables();
    for (const table of BETTER_AUTH_TABLES) {
      expect(tables, `missing table ${table}`).toContain(table);
    }
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
