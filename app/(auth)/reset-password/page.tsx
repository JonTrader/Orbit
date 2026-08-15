import type { Metadata } from "next";

import { AuthBurnerShell } from "@/components/auth/AuthBurnerShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthCard, AuthLink } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "Set a new password · Orbit",
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <AuthBurnerShell>
      <AuthCard
        title="Set a new password"
        intro="Choose a new password to get back into Orbit."
        footer={
          <AuthLink href={SIGN_IN_PATH} tone="muted">
            Back to sign in
          </AuthLink>
        }
      >
        <ResetPasswordForm />
      </AuthCard>
    </AuthBurnerShell>
  );
}
