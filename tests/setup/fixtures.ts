import { randomUUID } from "node:crypto";

import { user } from "@/lib/db/schema";

import { testDb } from "./db";

export async function createUser(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<typeof user.$inferSelect> {
  const id = overrides.id ?? randomUUID();
  const [row] = await testDb
    .insert(user)
    .values({
      id,
      name: overrides.name ?? "Test Member",
      email: overrides.email ?? `member-${id}@orbit.test`,
      emailVerified: overrides.emailVerified ?? true,
      ...overrides,
    })
    .returning();
  return row;
}

/** A calendar day string in the `date` column format. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
