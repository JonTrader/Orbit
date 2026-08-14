import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { AuthCard, FormMessage } from "@/components/auth/ui";
import { FORGOT_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = { title: "Set a new password · Orbit" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthCard
      title="Set a new password"
      intro={token ? "Choose the password you will use from now on." : undefined}
      footer={
        <Link href={SIGN_IN_PATH} className="hover:text-ink">
          Back to sign in
        </Link>
      }
    >
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-3">
          <FormMessage>That reset link is missing or expired.</FormMessage>
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="font-semibold text-accent"
          >
            Send a new one
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
