import { migrateTestDb, testDb, truncateAll } from "./db";
import { getSessionMock, setTestDatabase } from "./api-mocks";

export interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** Mocks the session returned by Better Auth's getSession. */
export function authenticateAs(
  userId: string,
  emailVerified = true,
): void {
  getSessionMock().mockResolvedValue({
    user: { id: userId, emailVerified },
  });
}

/** Mocks an unauthenticated caller. */
export function unauthenticate(): void {
  getSessionMock().mockResolvedValue(null);
}

/** Builds a JSON Request for a Route Handler test. */
export function jsonRequest(
  url: string,
  body: unknown,
  method = "POST",
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Parses a Route Handler Response body. */
export async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Context for routes with a single `spaceId` param. */
export function spaceContext(spaceId: string): {
  params: Promise<{ spaceId: string }>;
} {
  return { params: Promise.resolve({ spaceId }) };
}

/** Alias used by some suites for `spaceContext`. */
export const routeContext = spaceContext;

/** Context for routes with `spaceId` and a nested resource id. */
export function resourceContext<TResourceKey extends string>(
  spaceId: string,
  resourceKey: TResourceKey,
  resourceId: string,
): {
  params: Promise<{ spaceId: string } & Record<TResourceKey, string>>;
} {
  return {
    params: Promise.resolve({
      spaceId,
      [resourceKey]: resourceId,
    } as { spaceId: string } & Record<TResourceKey, string>),
  };
}

/** Context for Task routes. */
export function taskContext(
  spaceId: string,
  taskId: string,
): {
  params: Promise<{ spaceId: string; taskId: string }>;
} {
  return resourceContext(spaceId, "taskId", taskId);
}

/** Context for Note routes. */
export function noteContext(
  spaceId: string,
  noteId: string,
): {
  params: Promise<{ spaceId: string; noteId: string }>;
} {
  return resourceContext(spaceId, "noteId", noteId);
}

/** Context for Monthly routes. */
export function monthlyContext(
  spaceId: string,
  monthlyId: string,
): {
  params: Promise<{ spaceId: string; monthlyId: string }>;
} {
  return resourceContext(spaceId, "monthlyId", monthlyId);
}

/** Context for Section routes. */
export function sectionContext(
  spaceId: string,
  sectionId: string,
): {
  params: Promise<{ spaceId: string; sectionId: string }>;
} {
  return resourceContext(spaceId, "sectionId", sectionId);
}

/** Context for Member routes. */
export function memberContext(
  spaceId: string,
  userId: string,
): {
  params: Promise<{ spaceId: string; userId: string }>;
} {
  return { params: Promise.resolve({ spaceId, userId }) };
}

/** Context for Invite resend routes. */
export function inviteContext(inviteId: string): {
  params: Promise<{ inviteId: string }>;
} {
  return { params: Promise.resolve({ inviteId }) };
}

/** Standard API test lifecycle: wire the shared DB and reset auth each test. */
export function apiTestLifecycle(): {
  beforeAll: () => Promise<void>;
  beforeEach: () => Promise<void>;
} {
  return {
    beforeAll: async () => {
      setTestDatabase(testDb);
      await migrateTestDb();
    },
    beforeEach: async () => {
      await truncateAll();
      getSessionMock().mockReset();
    },
  };
}
