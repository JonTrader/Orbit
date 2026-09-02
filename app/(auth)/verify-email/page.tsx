import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import { APP_PATH, SIGN_IN_PATH } from "@/lib/auth/paths";
import { getAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify your email · Orbit" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ email }, session] = await Promise.all([
    searchParams,
    getAppSession(),
  ]);
  if (session?.user.emailVerified) redirect(APP_PATH);
  const address = email ?? session?.user.email;

  return (
    <AuthLayoutPad>
      <AuthCard
        title="Verify your email"
        intro="Open the link to unlock your Spaces."
        footer={
          <AuthLink href={SIGN_IN_PATH} tone="muted">
            Back to sign in
          </AuthLink>
        }
      >
        <ResendVerification email={address} />
      </AuthCard>
    </AuthLayoutPad>
  );
}
