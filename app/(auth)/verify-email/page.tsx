import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import {
  authCallbackUrl,
  continuationFromSearchParams,
  SIGN_IN_PATH,
  withContinuation,
} from "@/lib/auth/paths";
import { getAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify your email · Orbit" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const continuation = continuationFromSearchParams(params);
  const emailParam = params.email;
  const email = typeof emailParam === "string" ? emailParam : undefined;
  const session = await getAppSession();
  if (session?.user.emailVerified) redirect(authCallbackUrl(continuation));
  const address = email ?? session?.user.email;

  return (
    <AuthLayoutPad>
      <AuthCard
        title="Verify your email"
        intro="Open the link to unlock your Spaces."
        footer={
          <AuthLink
            href={withContinuation(SIGN_IN_PATH, continuation)}
            tone="muted"
          >
            Back to sign in
          </AuthLink>
        }
      >
        <ResendVerification email={address} continuation={continuation} />
      </AuthCard>
    </AuthLayoutPad>
  );
}
