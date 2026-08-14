import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import {
  hasFederatedAccount,
  resolveAppAccess,
  type AppAccess,
} from "@/lib/auth-access";
import { APP_PATH } from "@/lib/auth-paths";
import { getDb } from "@/lib/db/client";
import { TIMEZONE_COOKIE, normalizeTimeZone } from "@/lib/timezone";

export type AppSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

/** Memoised per render pass so a page and its layout share one lookup. */
export const getAppSession = cache(
  async (): Promise<AppSession | null> =>
    auth.api.getSession({ headers: await headers() }),
);

async function evaluateAppAccess(): Promise<AppAccess<AppSession>> {
  const session = await getAppSession();
  const federated =
    session && !session.user.emailVerified
      ? await hasFederatedAccount(getDb(), session.user.id)
      : false;

  return resolveAppAccess({ session, hasFederatedAccount: federated });
}

/** Redirects rather than returning for unauthenticated or unverified users. */
export async function requireVerifiedSession(): Promise<AppSession> {
  const access = await evaluateAppAccess();
  if (!access.allowed) redirect(access.redirectTo);
  return access.session;
}

/** Keeps signed-in users off the sign-in and sign-up pages. */
export async function redirectIfVerified(to = APP_PATH): Promise<void> {
  const access = await evaluateAppAccess();
  if (access.allowed) redirect(to);
}

/** The zone the auth pages recorded in the browser, when it is usable. */
export async function readCreatorTimeZone(): Promise<string | undefined> {
  const store = await cookies();
  return normalizeTimeZone(store.get(TIMEZONE_COOKIE)?.value);
}
