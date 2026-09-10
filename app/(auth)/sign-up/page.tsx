import type { Metadata } from "next";

import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import { Divider } from "@/components/auth/kit/Divider";
import {
  authCallbackUrl,
  CONTINUATION_PARAM,
  parseLocalContinuation,
  SIGN_IN_PATH,
  withContinuation,
} from "@/lib/auth/paths";
import { getConfiguredOAuthProviderIds } from "@/lib/auth/oauth";
import { redirectIfVerified } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account · Orbit" };

export default async function SignUpPage({
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
        title="Create your account"
        intro="You start with a Personal Space. Invite the household onto the same list later."
        footer={
          <span>
            Already have an account?{" "}
            <AuthLink href={withContinuation(SIGN_IN_PATH, continuation)}>
              Sign in
            </AuthLink>
          </span>
        }
      >
        <div className="flex flex-col gap-4">
          <SignUpForm continuation={continuation} />
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
