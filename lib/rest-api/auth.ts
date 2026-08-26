import { auth } from "@/lib/auth/config";

import { unauthenticatedError } from "./errors";

export type ApiSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/** Reads the Better Auth session from the incoming API request. */
export async function requireApiSession(
  request: Request,
): Promise<ApiSession> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    throw unauthenticatedError();
  }

  if (!session.user.emailVerified) {
    throw unauthenticatedError("Email verification is required");
  }

  return session;
}
