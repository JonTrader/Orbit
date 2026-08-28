import { defineConfig } from "@playwright/test";

/**
 * Phase G E2E: drives the real app against a real dev server and database.
 * Reuses an already-running `npm run dev` on port 3000; starts one otherwise.
 * The server's DATABASE_URL (dev Neon branch) is where spec users land - do
 * not point this at production.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
