import { describe, expect, it } from "vitest";

import { TEST_DATABASE_URL_VAR, resolveTestDatabaseUrl } from "../setup/env";

describe("test database url guard", () => {
  it("fails loudly when DATABASE_URL_TEST is missing", () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(TEST_DATABASE_URL_VAR);
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL_TEST: "  " })).toThrow(
      TEST_DATABASE_URL_VAR,
    );
  });

  it("refuses to run against the application database", () => {
    const url = "postgresql://user:pw@host/neondb";
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL_TEST: url, DATABASE_URL: url }),
    ).toThrow(/must not equal DATABASE_URL/);
  });

  it("returns the configured test url", () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: "postgresql://user:pw@test-host/neondb",
        DATABASE_URL: "postgresql://user:pw@app-host/neondb",
      }),
    ).toBe("postgresql://user:pw@test-host/neondb");
  });

  it("is configured for this run", () => {
    expect(resolveTestDatabaseUrl()).toMatch(/^postgres(ql)?:\/\//);
  });
});
