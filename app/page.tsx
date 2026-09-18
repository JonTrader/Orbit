import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/landing/LandingPage";
import { LANDING_DESCRIPTION } from "@/components/landing/meta";
import { resolveAppAccess } from "@/lib/auth/access";
import {
  continuationFromSearchParams,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
  verifyEmailPath,
  withContinuation,
} from "@/lib/auth/paths";
import { getAppSession, readCreatorTimeZone } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveEntrySpace } from "@/lib/onboarding";
import { spaceSectionPath } from "@/lib/spaces/paths";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-landing-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  referrer: "no-referrer",
  title: "Orbit",
  description: LANDING_DESCRIPTION,
};

/**
 * Public marketing entry at `/`. Guests and verified sessions both see the
 * marketing landing; verified CTAs enter the app via resolveEntrySpace → Upcoming.
 * Invite continuations still redirect after onboarding. Unverified sessions go
 * to email verification.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAppSession();
  const access = resolveAppAccess({ session });
  const fontClass = `${syne.variable} ${manrope.variable}`;
  const params = await searchParams;
  const continuation = continuationFromSearchParams(params);

  if (!access.allowed) {
    if (access.redirectTo === VERIFY_EMAIL_PATH && session) {
      redirect(verifyEmailPath(session.user.email, continuation));
    }

    return (
      <LandingPage
        className={fontClass}
        signUpHref={withContinuation(SIGN_UP_PATH, continuation)}
        signInHref={withContinuation(SIGN_IN_PATH, continuation)}
      />
    );
  }

  const spaceId = await resolveEntrySpace(getDb(), {
    userId: access.session.user.id,
    timezone: await readCreatorTimeZone(),
  });
  if (continuation) redirect(continuation);

  return (
    <LandingPage
      className={fontClass}
      enterHref={spaceSectionPath(spaceId, "upcoming")}
    />
  );
}
