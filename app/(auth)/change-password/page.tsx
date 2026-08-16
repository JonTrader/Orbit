import type { Metadata } from "next";

import { AuthBurnerShell } from "@/components/auth/AuthBurnerShell";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { AuthCard, AuthLink } from "@/components/auth/ui";
import { APP_PATH } from "@/lib/auth-paths";
import { requireCredentialSession } from "@/lib/session";

export const metadata: Metadata = { title: "Change password · Orbit" };

export default async function ChangePasswordPage() {
  await requireCredentialSession();

  return (
    <AuthBurnerShell>
      <AuthCard
        title="Change password"
        intro="Confirm it's you, then choose a new one."
        footer={
          <AuthLink href={APP_PATH} tone="muted">
            Back to Orbit
          </AuthLink>
        }
      >
        <ChangePasswordForm />
      </AuthCard>
    </AuthBurnerShell>
  );
}
