import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { requireEnv } from "@/lib/env";

import * as schema from "./schema";

// Node >= 22 provides a native global WebSocket, which the Neon driver uses
// when no webSocketConstructor is set.

export type OrbitDb = ReturnType<typeof drizzle<typeof schema>>;

export interface DbClient {
  db: OrbitDb;
  pool: Pool;
  close: () => Promise<void>;
}

export function createDbClient(connectionString: string): DbClient {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

let cached: DbClient | undefined;

/** Application client bound to `DATABASE_URL`. Tests use their own client. */
export function getDb(): OrbitDb {
  if (!cached) {
    // `next build` imports the auth config, which builds its adapter from this
    // client, so the build gets a pool it never connects with.
    cached = createDbClient(
      requireEnv("DATABASE_URL", "postgres://build@localhost/orbit"),
    );
  }
  return cached.db;
}

export { schema };
