import { defineConfig } from "@playwright/test";

import { bootstrapE2eDatabaseUrl } from "./e2e/env";

const e2eEnv = bootstrapE2eDatabaseUrl();

/**
 * Playwright E2E: drives the real app against a real server and database.
 * Requires the same DATABASE_URL_TEST guardrails as Vitest and holds the
 * shared advisory lock for the full run before the app boots.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  globalSetup: "./e2e/db-lock.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eEnv.databaseUrl,
    },
  },
});
