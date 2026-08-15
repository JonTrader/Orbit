import type { Metadata } from "next";

import { AuthPadShell } from "@/components/auth/AuthPadShell";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthCard, AuthLink, Divider } from "@/components/auth/ui";
import { FORGOT_PASSWORD_PATH, SIGN_UP_PATH } from "@/lib/auth-paths";
import { redirectIfVerified } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function SignInPage() {
  await redirectIfVerified();

  return (
    <AuthPadShell>
      <AuthCard
        title="Sign in"
        intro="The household list without the fridge magnets. Daily and Monthlies, in one Space."
        footer={
          <>
            <AuthLink href={SIGN_UP_PATH}>Create an account</AuthLink>
            <AuthLink href={FORGOT_PASSWORD_PATH} tone="muted">
              Forgot password?
            </AuthLink>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SignInForm />
          <Divider label="or" />
          <OAuthButtons />
        </div>
      </AuthCard>
    </AuthPadShell>
  );
}
