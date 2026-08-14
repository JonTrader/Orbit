import type { Metadata } from "next";
import Link from "next/link";

import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthCard, Divider } from "@/components/auth/ui";
import { FORGOT_PASSWORD_PATH, SIGN_UP_PATH } from "@/lib/auth-paths";
import { redirectIfVerified } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function SignInPage() {
  await redirectIfVerified();

  return (
    <AuthCard
      title="Sign in"
      intro="Pick up your Daily list and Monthlies where you left off."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={SIGN_UP_PATH} className="font-semibold text-accent">
            Create an account
          </Link>
          <Link href={FORGOT_PASSWORD_PATH} className="hover:text-ink">
            Forgot password?
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SignInForm />
        <Divider label="or" />
        <OAuthButtons />
      </div>
    </AuthCard>
  );
}
