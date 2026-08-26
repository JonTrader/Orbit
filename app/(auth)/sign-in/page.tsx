import type { Metadata } from "next";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthCard, AuthLink, Divider } from "@/components/auth/ui";
import { FORGOT_PASSWORD_PATH, SIGN_UP_PATH } from "@/lib/auth-paths";
import { getConfiguredOAuthProviderIds } from "@/lib/oauth-providers";
import { redirectIfVerified } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function SignInPage() {
  await redirectIfVerified();
  const oauthProviders = getConfiguredOAuthProviderIds();

  return (
    <AuthLayoutPad>
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
