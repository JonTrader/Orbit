import { expect } from "vitest";

/**
 * Assert the structured PostgreSQL error produced by a rejected database
 * query, rather than accepting any thrown error.
 */
export function expectPostgresConstraint(
  query: PromiseLike<unknown>,
  code: "23503" | "23505" | "23514",
  constraint: string,
): Promise<void> {
  return expect(query).rejects.toMatchObject({
    cause: { code, constraint },
  });
}
