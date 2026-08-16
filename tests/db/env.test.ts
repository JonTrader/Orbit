import { describe, expect, it } from "vitest";

import {
  TEST_DATABASE_CONFIRMATION_VAR,
  TEST_DATABASE_URL_VAR,
  resolveTestDatabaseUrl,
} from "../setup/env";

describe("test database url guard", () => {
  it("fails loudly when DATABASE_URL_TEST is missing", () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(TEST_DATABASE_URL_VAR);
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL_TEST: "  " })).toThrow(
      TEST_DATABASE_URL_VAR,
    );
  });

  it("requires an explicit dedicated-branch confirmation", () => {
    const env = { DATABASE_URL_TEST: "postgresql://user:pw@test-host/neondb" };

    expect(() => resolveTestDatabaseUrl(env)).toThrow(
      TEST_DATABASE_CONFIRMATION_VAR,
    );
    expect(() =>
      resolveTestDatabaseUrl({
        ...env,
        [TEST_DATABASE_CONFIRMATION_VAR]: "production",
      }),
    ).toThrow(/dedicated-neon-branch/);
  });

  it("refuses to run against the application database", () => {
    const url = "postgresql://user:pw@host/neondb";
    const confirmation = {
      [TEST_DATABASE_CONFIRMATION_VAR]: "dedicated-neon-branch",
    };

    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: url,
        DATABASE_URL: url,
        ...confirmation,
      }),
    ).toThrow(/must not equal DATABASE_URL/);
  });

  it("refuses a test URL on the same database host", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: "postgresql://test-user:pw@prod-host/neondb",
        DATABASE_URL: "postgresql://prod-user:pw@prod-host/neondb",
        [TEST_DATABASE_CONFIRMATION_VAR]: "dedicated-neon-branch",
      }),
    ).toThrow(/same database host/);
  });

  it("returns the configured test url", () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: "postgresql://user:pw@test-host/neondb",
        DATABASE_URL: "postgresql://user:pw@app-host/neondb",
        [TEST_DATABASE_CONFIRMATION_VAR]: "dedicated-neon-branch",
      }),
    ).toBe("postgresql://user:pw@test-host/neondb");
  });

  it("is configured for this run", () => {
    expect(resolveTestDatabaseUrl()).toMatch(/^postgres(ql)?:\/\//);
  });
});
