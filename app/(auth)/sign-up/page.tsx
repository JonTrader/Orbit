import type { Metadata } from "next";

import { AuthPadShell } from "@/components/auth/AuthPadShell";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthCard, AuthLink, Divider } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { redirectIfVerified } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account · Orbit" };

export default async function SignUpPage() {
  await redirectIfVerified();

  return (
    <AuthPadShell>
      <AuthCard
        title="Create your account"
        intro="You start with a Personal Space. Invite the household onto the same list later."
        footer={
          <span>
            Already have an account?{" "}
            <AuthLink href={SIGN_IN_PATH}>Sign in</AuthLink>
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <SignUpForm />
          <Divider label="or" />
          <OAuthButtons />
        </div>
      </AuthCard>
    </AuthPadShell>
  );
}
