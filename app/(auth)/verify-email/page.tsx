import type { Metadata } from "next";

import { AuthPadShell } from "@/components/auth/AuthPadShell";
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
    <AuthPadShell>
      <AuthCard
        title="Verify your email"
        intro="Open the link to unlock your Spaces."
        footer={
          <AuthLink href={SIGN_IN_PATH} tone="muted">
            Back to sign in
          </AuthLink>
        }
      >
        {address ? (
          <p className="mb-4 text-[0.95rem] leading-relaxed text-(--auth-muted)">
            Sent to <em className="not-italic font-bold text-(--auth-ink)">{address}</em>.
            If it is not in the inbox, look in spam. The link lasts a day.
          </p>
        ) : null}
        <ResendVerification email={address} />
      </AuthCard>
    </AuthPadShell>
  );
}
