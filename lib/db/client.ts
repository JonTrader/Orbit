import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// The Neon serverless driver talks WebSocket outside the edge runtime.
neonConfig.webSocketConstructor = ws;

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
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = createDbClient(url);
  }
  return cached.db;
}

export { schema };
