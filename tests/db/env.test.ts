import { describe, expect, it } from "vitest";

import {
  DEDICATED_DATABASE_CONFIRMATION,
  E2E_DATABASE_CONFIRMATION_VAR,
  E2E_DATABASE_URL_VAR,
  TEST_DATABASE_CONFIRMATION_VAR,
  TEST_DATABASE_URL_VAR,
  resolveE2eDatabaseUrl,
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

describe("e2e database url guard", () => {
  it("fails loudly when DATABASE_URL_E2E is missing", () => {
    expect(() => resolveE2eDatabaseUrl({})).toThrow(E2E_DATABASE_URL_VAR);
    expect(() => resolveE2eDatabaseUrl({ DATABASE_URL_E2E: "  " })).toThrow(
      E2E_DATABASE_URL_VAR,
    );
    expect(() =>
      resolveE2eDatabaseUrl({
        DATABASE_URL_TEST: "postgresql://user:pw@test-host/neondb",
        [TEST_DATABASE_CONFIRMATION_VAR]: DEDICATED_DATABASE_CONFIRMATION,
      }),
    ).toThrow(E2E_DATABASE_URL_VAR);
  });

  it("requires an explicit dedicated-branch confirmation", () => {
    const env = { DATABASE_URL_E2E: "postgresql://user:pw@e2e-host/neondb" };

    expect(() => resolveE2eDatabaseUrl(env)).toThrow(
      E2E_DATABASE_CONFIRMATION_VAR,
    );
    expect(() =>
      resolveE2eDatabaseUrl({
        ...env,
        [E2E_DATABASE_CONFIRMATION_VAR]: "production",
      }),
    ).toThrow(/dedicated-neon-branch/);
  });

  it("refuses to run against the application database", () => {
    const url = "postgresql://user:pw@host/neondb";
    const confirmation = {
      [E2E_DATABASE_CONFIRMATION_VAR]: DEDICATED_DATABASE_CONFIRMATION,
    };

    expect(() =>
      resolveE2eDatabaseUrl({
        DATABASE_URL_E2E: url,
        DATABASE_URL: url,
        ...confirmation,
      }),
    ).toThrow(/must not equal DATABASE_URL/);
  });

  it("refuses an e2e URL on the same database host", () => {
    expect(() =>
      resolveE2eDatabaseUrl({
        DATABASE_URL_E2E: "postgresql://e2e-user:pw@prod-host/neondb",
        DATABASE_URL: "postgresql://prod-user:pw@prod-host/neondb",
        [E2E_DATABASE_CONFIRMATION_VAR]: DEDICATED_DATABASE_CONFIRMATION,
      }),
    ).toThrow(/same database host/);
  });

  it("returns the configured e2e url", () => {
    expect(
      resolveE2eDatabaseUrl({
        DATABASE_URL_E2E: "postgresql://user:pw@e2e-host/neondb",
        DATABASE_URL: "postgresql://user:pw@app-host/neondb",
        [E2E_DATABASE_CONFIRMATION_VAR]: DEDICATED_DATABASE_CONFIRMATION,
      }),
    ).toBe("postgresql://user:pw@e2e-host/neondb");
  });
});
