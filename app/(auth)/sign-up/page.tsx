import type { Metadata } from "next";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthCard } from "./kit/AuthCard";
import { AuthLink } from "./kit/AuthLink";
import { Divider } from "./kit/Divider";
import { SIGN_IN_PATH } from "@/lib/auth/paths";
import { getConfiguredOAuthProviderIds } from "@/lib/auth/oauth";
import { redirectIfVerified } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account · Orbit" };

export default async function SignUpPage() {
  await redirectIfVerified();
  const oauthProviders = getConfiguredOAuthProviderIds();

  return (
    <AuthLayoutPad>
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
          {oauthProviders.length > 0 ? (
            <>
              <Divider label="or" />
              <OAuthButtons providers={oauthProviders} />
            </>
          ) : null}
        </div>
      </AuthCard>
    </AuthLayoutPad>
  );
}
