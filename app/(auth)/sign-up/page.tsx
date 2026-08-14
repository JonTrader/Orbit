import type { Metadata } from "next";
import Link from "next/link";

import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthCard, Divider } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { redirectIfVerified } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account · Orbit" };

export default async function SignUpPage() {
  await redirectIfVerified();

  return (
    <AuthCard
      title="Create your account"
      intro="You start with a Personal Space holding Daily and Monthlies. Invite the household later."
      footer={
        <>
          Already have an account?{" "}
          <Link href={SIGN_IN_PATH} className="font-semibold text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SignUpForm />
        <Divider label="or" />
        <OAuthButtons />
      </div>
    </AuthCard>
  );
}
