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
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
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

vi.mock("@/lib/email/mailer", () => ({
  sendEmail: apiMocks.sendEmail,
}));

/** Returns the shared mock session function. */
export function getSessionMock() {
  return apiMocks.getSession;
}

/** Returns the shared mailer mock used by Invite delivery. */
export function getSendEmailMock() {
  return apiMocks.sendEmail;
}

/** Wires the shared mock to the test database client. */
export function setTestDatabase(database: unknown): void {
  apiMocks.database = database;
}
