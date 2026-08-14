import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthCard } from "@/components/auth/ui";
import { SIGN_IN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = { title: "Forgot password · Orbit" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      intro="We will email you a link to choose a new one."
      footer={
        <Link href={SIGN_IN_PATH} className="hover:text-ink">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
