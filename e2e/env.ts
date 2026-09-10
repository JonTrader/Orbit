import { config } from "dotenv";

import { resolveE2eDatabaseUrl } from "../tests/setup/env";

const E2E_DATABASE_REDIRECTED_VAR = "ORBIT_E2E_DATABASE_REDIRECTED";

export interface E2eEnvBootstrap {
  /** Connection string shared by the app under test and e2e helpers. */
  databaseUrl: string;
}

let bootstrapped: E2eEnvBootstrap | undefined;

/**
 * Load `.env.test` / `.env`, then require a dedicated Neon e2e branch.
 * The app server and direct DB helpers must share one connection string or
 * sign-up and verification diverge.
 */
export function bootstrapE2eDatabaseUrl(): E2eEnvBootstrap {
  if (bootstrapped) {
    return bootstrapped;
  }

  config({ path: ".env.test", quiet: true });
  config({ path: ".env", quiet: true });

  const resolved = resolveE2eDatabaseUrl(
    process.env[E2E_DATABASE_REDIRECTED_VAR] === "1"
      ? { ...process.env, DATABASE_URL: undefined }
      : process.env,
  );
  process.env.DATABASE_URL = resolved;
  process.env[E2E_DATABASE_REDIRECTED_VAR] = "1";
  bootstrapped = { databaseUrl: resolved };
  return bootstrapped;
}
