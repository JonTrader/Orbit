import { vi } from "vitest";

/**
 * Shared Vitest mocks for Server Action tests.
 *
 * Import this module first in an action test file (before the action module
 * import) so the `vi.mock` calls are registered before the mocked modules
 * load. Actions depend on Next runtime machinery (session cookies, the cache
 * store, the mailer seam) that does not exist in a plain node environment.
 */
const actionMocks = vi.hoisted(() => ({
  requireVerifiedSession: vi.fn(),
  revalidatePath: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireVerifiedSession: actionMocks.requireVerifiedSession,
}));

vi.mock("next/cache", () => ({
  revalidatePath: actionMocks.revalidatePath,
}));

vi.mock("@/lib/email/mailer", () => ({
  sendEmail: actionMocks.sendEmail,
}));

/** The shared session guard mock; per-test `authenticateAs` drives it. */
export function getRequireVerifiedSessionMock() {
  return actionMocks.requireVerifiedSession;
}

/** The shared revalidatePath mock; assert calls per test. */
export function getRevalidatePathMock() {
  return actionMocks.revalidatePath;
}

/** Mocks the action session guard for one verified user. */
export function authenticateAs(userId: string): void {
  actionMocks.requireVerifiedSession.mockResolvedValue({
    user: { id: userId },
  });
}