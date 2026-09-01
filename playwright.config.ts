import { defineConfig } from "@playwright/test";

import { bootstrapE2eDatabaseUrl } from "./e2e/env";

const e2eEnv = bootstrapE2eDatabaseUrl();

/**
 * Phase G E2E: drives the real app against a real server and database.
 * When DATABASE_URL_TEST is set, bootstrap redirects DATABASE_URL to that
 * branch (same guards as the Vitest suite) and starts a fresh dev server so
 * an existing npm run dev on the dev branch is not reused by mistake.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !e2eEnv.usesTestBranch,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eEnv.databaseUrl,
    },
  },
});
