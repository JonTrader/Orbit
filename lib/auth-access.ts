import { and, eq, ne } from "drizzle-orm";

import { SIGN_IN_PATH, VERIFY_EMAIL_PATH } from "@/lib/auth-paths";
import type { OrbitDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";

/** Better Auth's provider id for email/password accounts. */
export const CREDENTIAL_PROVIDER_ID = "credential";

/** True when the user signed in through Google or Microsoft (spec §3). */
export async function hasFederatedAccount(
  db: OrbitDb,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        ne(account.providerId, CREDENTIAL_PROVIDER_ID),
      ),
    )
    .limit(1);
  return row !== undefined;
}

type SessionShape = { user: { emailVerified: boolean } };

export type AppAccess<T extends SessionShape> =
  | { allowed: true; session: T }
  | { allowed: false; redirectTo: string };

/**
 * The app gate: signed in, and verified unless an OAuth provider already
 * vouched for the address (spec §3).
 */
export function resolveAppAccess<T extends SessionShape>(input: {
  session: T | null | undefined;
  hasFederatedAccount?: boolean;
}): AppAccess<T> {
  if (!input.session) return { allowed: false, redirectTo: SIGN_IN_PATH };

  const verified =
    input.session.user.emailVerified || input.hasFederatedAccount === true;
  if (!verified) return { allowed: false, redirectTo: VERIFY_EMAIL_PATH };

  return { allowed: true, session: input.session };
}
