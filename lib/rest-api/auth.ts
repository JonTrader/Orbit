import { auth } from "@/lib/auth/config";
import { resolveAppAccess } from "@/lib/auth/access";
import { VERIFY_EMAIL_PATH } from "@/lib/auth/paths";
import type { AppSession } from "@/lib/auth/session";

import { unauthenticatedError } from "./errors";

/** Reads the Better Auth session from the incoming API request. */
export async function requireApiSession(
  request: Request,
): Promise<AppSession> {
  const session = await auth.api.getSession({ headers: request.headers });
  const access = resolveAppAccess({ session });

  if (!access.allowed) {
    throw access.redirectTo === VERIFY_EMAIL_PATH
      ? unauthenticatedError("Email verification is required")
      : unauthenticatedError();
  }

  return access.session;
}
