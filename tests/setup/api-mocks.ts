import { vi } from "vitest";

/**
 * Shared Vitest mocks for API Route Handler tests.
 *
 * Import this module first in an API test file (before Route Handler imports)
 * so `vi.mock` is hoisted and registered before the mocked modules load.
 */
const apiMocks = vi.hoisted(() => ({
  database: undefined as unknown,
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: apiMocks.getSession,
    },
  },
}));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    getDb: () => apiMocks.database,
  };
});

/** Returns the shared mock session function. */
export function getSessionMock() {
  return apiMocks.getSession;
}

/** Wires the shared mock to the test database client. */
export function setTestDatabase(database: unknown): void {
  apiMocks.database = database;
}
