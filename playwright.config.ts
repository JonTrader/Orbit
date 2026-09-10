import { defineConfig } from "@playwright/test";

import { bootstrapE2eDatabaseUrl } from "./e2e/env";

const e2eEnv = bootstrapE2eDatabaseUrl();

/**
 * Playwright E2E: drives the real app against a real server and a dedicated
 * Neon e2e branch (DATABASE_URL_E2E). Never DATABASE_URL / production.
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
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eEnv.databaseUrl,
    },
  },
});
