import type { Metadata } from "next";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { AuthCard, AuthLink } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { getAppSession } from "@/lib/session";

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
