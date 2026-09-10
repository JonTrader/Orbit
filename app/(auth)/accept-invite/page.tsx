import type { Metadata } from "next";

import { AcceptInviteButton } from "@/components/auth/AcceptInviteButton";
import { AuthLayoutPad } from "@/components/auth/AuthLayoutPad";
import { SwitchAccountButton } from "@/components/auth/SwitchAccountButton";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import {
  acceptInvitePath,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  verifyEmailPath,
  withContinuation,
} from "@/lib/auth/paths";
import { getAppSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { previewInviteByToken } from "@/lib/services/members";
import { roleLabel } from "@/lib/spaces/role-label";

export const metadata: Metadata = {
  title: "Accept Invite · Orbit",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token: rawToken }, session] = await Promise.all([
    searchParams,
    getAppSession(),
  ]);
  const token = typeof rawToken === "string" ? rawToken : "";
  const preview = await previewInviteByToken(getDb(), token, {
    viewerEmail: session?.user.email,
  });
  const continuation = token ? acceptInvitePath(token) : null;

  if (preview.status === "unavailable") {
    return (
      <AuthLayoutPad>
        <AuthCard
          title="Invite unavailable"
          intro="This Invite link is invalid or has already been used."
          footer={
            <AuthLink href={SIGN_IN_PATH} tone="muted">
              Back to sign in
            </AuthLink>
          }
        >
          <p className="text-[0.92rem] text-(--auth-muted)">
            Ask the Space Owner to send a new Invite if you still need access.
          </p>
        </AuthCard>
      </AuthLayoutPad>
    );
  }

  if (preview.status === "expired") {
    return (
      <AuthLayoutPad>
        <AuthCard
          title="Invite expired"
          intro={
            preview.spaceName
              ? `The Invite to join "${preview.spaceName}" has expired.`
              : "This Invite has expired."
          }
          footer={
            <AuthLink href={SIGN_IN_PATH} tone="muted">
              Back to sign in
            </AuthLink>
          }
        >
          <p className="text-[0.92rem] text-(--auth-muted)">
            Ask the Space Owner to resend the Invite.
          </p>
        </AuthCard>
      </AuthLayoutPad>
    );
  }

  const spaceName = preview.spaceName ?? "this Space";
  const role = preview.role ? roleLabel(preview.role) : "Member";
  const inviteSummary = (
    <p className="text-[0.92rem] text-(--auth-muted)">
      You are invited to <span className="font-bold text-(--auth-ink)">{spaceName}</span>{" "}
      as {role}
      {preview.maskedEmail ? (
        <>
          {" "}
          for <span className="font-mono text-[0.85rem]">{preview.maskedEmail}</span>
        </>
      ) : null}
      .
    </p>
  );

  if (!session) {
    return (
      <AuthLayoutPad>
        <AuthCard
          title="Join this Space"
          intro={`Accept the Invite to ${spaceName} on Orbit.`}
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
            {inviteSummary}
            <div className="flex flex-col gap-2">
              <AuthLink href={withContinuation(SIGN_IN_PATH, continuation)}>
                Sign in to accept
              </AuthLink>
              <AuthLink href={withContinuation(SIGN_UP_PATH, continuation)}>
                Create an account
              </AuthLink>
            </div>
          </div>
        </AuthCard>
      </AuthLayoutPad>
    );
  }

  if (!session.user.emailVerified) {
    return (
      <AuthLayoutPad>
        <AuthCard
          title="Verify your email"
          intro="Verify your email before accepting this Invite."
          footer={
            <AuthLink
              href={verifyEmailPath(session.user.email, continuation)}
              tone="muted"
            >
              Open verification
            </AuthLink>
          }
        >
          <div className="flex flex-col gap-4">
            {inviteSummary}
            <p className="text-[0.92rem] text-(--auth-muted)">
              Open the verification link we sent, then return here to join{" "}
              {spaceName}.
            </p>
          </div>
        </AuthCard>
      </AuthLayoutPad>
    );
  }

  if (preview.emailMatches === false) {
    return (
      <AuthLayoutPad>
        <AuthCard
          title="Wrong account"
          intro="This Invite was sent to a different email address."
        >
          <div className="flex flex-col gap-4">
            {inviteSummary}
            <p className="text-[0.92rem] text-(--auth-muted)">
              Signed in as{" "}
              <span className="font-mono text-[0.85rem]">{session.user.email}</span>.
              Switch to the invited account to continue.
            </p>
            {continuation ? (
              <SwitchAccountButton continuation={continuation} />
            ) : null}
          </div>
        </AuthCard>
      </AuthLayoutPad>
    );
  }

  return (
    <AuthLayoutPad>
      <AuthCard
        title="Accept Invite"
        intro={`Join ${spaceName} as ${role}.`}
      >
        <div className="flex flex-col gap-4">
          {inviteSummary}
          <AcceptInviteButton token={token} />
        </div>
      </AuthCard>
    </AuthLayoutPad>
  );
}
