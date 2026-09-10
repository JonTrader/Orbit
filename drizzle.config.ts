import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env", quiet: true });

// `npm run db:*` targets DATABASE_URL; point DRIZZLE_DATABASE_URL at a Neon
// test or e2e branch to run drizzle-kit against it.
const url =
  process.env.DRIZZLE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
