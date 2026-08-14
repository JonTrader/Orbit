import type { Metadata } from "next";
import Link from "next/link";

import { ResendVerification } from "@/components/auth/ResendVerification";
import { AuthCard } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { getAppSession } from "@/lib/session";

export const metadata: Metadata = { title: "Verify your email · Orbit" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ email }, session] = await Promise.all([
    searchParams,
    getAppSession(),
  ]);
  const address = email ?? session?.user.email;

  return (
    <AuthCard
      title="Verify your email"
      intro={
        address
          ? `We sent a link to ${address}. Open it to unlock Orbit.`
          : "Open the link we emailed you to unlock Orbit."
      }
      footer={
        <Link href={SIGN_IN_PATH} className="hover:text-ink">
          Back to sign in
        </Link>
      }
    >
      <ResendVerification email={address} />
    </AuthCard>
  );
}
