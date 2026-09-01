import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth/config";
import { hasCredentialAccount, resolveAppAccess } from "@/lib/auth/access";
import { APP_PATH } from "@/lib/auth/paths";
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

/** Redirects rather than returning for unauthenticated or unverified users. */
export async function requireVerifiedSession(): Promise<AppSession> {
  const access = resolveAppAccess({ session: await getAppSession() });
  if (!access.allowed) redirect(access.redirectTo);
  return access.session;
}

/** Allows only users with a local password to reach password-management pages. */
export async function requireCredentialSession(): Promise<AppSession> {
  const access = resolveAppAccess({ session: await getAppSession() });
  if (!access.allowed) redirect(access.redirectTo);
  if (!(await hasCredentialAccount(getDb(), access.session.user.id))) {
    redirect(APP_PATH);
  }
  return access.session;
}

/** Keeps signed-in, verified users off the sign-in and sign-up pages. */
export async function redirectIfVerified(to = APP_PATH): Promise<void> {
  const session = await getAppSession();
  if (session?.user.emailVerified) redirect(to);
}

/** The zone the auth pages recorded in the browser, when it is usable. */
export async function readCreatorTimeZone(): Promise<string | undefined> {
  const store = await cookies();
  return normalizeTimeZone(store.get(TIMEZONE_COOKIE)?.value);
}
