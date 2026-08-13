import { beforeAll, describe, expect, it } from "vitest";

import {
  countAppliedMigrations,
  listPublicTables,
  migrateTestDb,
  resetTestSchema,
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

const BETTER_AUTH_TABLES = ["user", "session", "account", "verification"];

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

  it("is a no-op when migrations run a second time", async () => {
    await expect(migrateTestDb()).resolves.not.toThrow();
    expect(await countAppliedMigrations()).toBe(appliedAfterFirstRun);
    const tables = await listPublicTables();
    for (const table of [...ORBIT_TABLES, ...BETTER_AUTH_TABLES]) {
      expect(tables).toContain(table);
    }
  });
});
