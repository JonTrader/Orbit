import type { Metadata } from "next";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import { Divider } from "@/components/auth/kit/Divider";
import {
  authCallbackUrl,
  CONTINUATION_PARAM,
  FORGOT_PASSWORD_PATH,
  parseLocalContinuation,
  SIGN_UP_PATH,
  withContinuation,
} from "@/lib/auth/paths";
import { getConfiguredOAuthProviderIds } from "@/lib/auth/oauth";
import { redirectIfVerified } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · Orbit" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawContinue = params[CONTINUATION_PARAM];
  const continuation = parseLocalContinuation(
    Array.isArray(rawContinue) ? rawContinue[0] : rawContinue,
  );
  await redirectIfVerified(authCallbackUrl(continuation));
  const oauthProviders = getConfiguredOAuthProviderIds();

  return (
    <AuthLayoutPad>
      <AuthCard
        title="Sign in"
        intro="The household list without the fridge magnets. Daily and Monthlies, in one Space."
        footer={
          <>
            <AuthLink href={withContinuation(SIGN_UP_PATH, continuation)}>
              Create an account
            </AuthLink>
            <AuthLink href={FORGOT_PASSWORD_PATH} tone="muted">
              Forgot password?
            </AuthLink>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SignInForm continuation={continuation} />
          {oauthProviders.length > 0 ? (
            <>
              <Divider label="or" />
              <OAuthButtons
                providers={oauthProviders}
                callbackURL={authCallbackUrl(continuation)}
              />
            </>
          ) : null}
        </div>
      </AuthCard>
    </AuthLayoutPad>
  );
}
