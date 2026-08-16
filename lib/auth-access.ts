import { and, eq } from "drizzle-orm";

import { SIGN_IN_PATH, VERIFY_EMAIL_PATH } from "@/lib/auth-paths";
import type { OrbitDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";

/** Better Auth's provider id for email/password accounts. */
export const CREDENTIAL_PROVIDER_ID = "credential";

/** True when the user has a local email/password credential account. */
export async function hasCredentialAccount(
  db: OrbitDb,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL_PROVIDER_ID)),
    )
    .limit(1);
  return row !== undefined;
}

type SessionShape = { user: { emailVerified: boolean } };

export type AppAccess<T extends SessionShape> =
  | { allowed: true; session: T }
  | { allowed: false; redirectTo: string };

/**
 * The app gate: signed in and verified. OAuth account creation persists the
 * provider's verification before the session reaches this gate (spec §3).
 */
export function resolveAppAccess<T extends SessionShape>(input: {
  session: T | null | undefined;
}): AppAccess<T> {
  if (!input.session) return { allowed: false, redirectTo: SIGN_IN_PATH };

  if (!input.session.user.emailVerified) {
    return { allowed: false, redirectTo: VERIFY_EMAIL_PATH };
  }

  return { allowed: true, session: input.session };
}
