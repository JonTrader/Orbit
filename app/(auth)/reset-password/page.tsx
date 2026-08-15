import type { Metadata } from "next";

import { AuthBurnerShell } from "@/components/auth/AuthBurnerShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthCard, AuthLink, FormMessage } from "@/components/auth/ui";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = { title: "Set a new password · Orbit" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthBurnerShell>
      <AuthCard
        title="Set a new password"
        intro={
          token ? "This is the password you will use from now on." : undefined
        }
        footer={
          <AuthLink href={SIGN_IN_PATH} tone="muted">
            Back to sign in
          </AuthLink>
        }
      >
        {token && !error ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="flex flex-col gap-3">
            <FormMessage>That reset link is missing or expired.</FormMessage>
            <AuthLink href={FORGOT_PASSWORD_PATH}>Send a new one</AuthLink>
          </div>
        )}
      </AuthCard>
    </AuthBurnerShell>
  );
}
