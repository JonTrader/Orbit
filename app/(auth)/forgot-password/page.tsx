import type { Metadata } from "next";

import { AuthLayoutBurner } from "@/components/auth/AuthLayoutBurner";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthCard } from "@/components/auth/kit/AuthCard";
import { AuthLink } from "@/components/auth/kit/AuthLink";
import { SIGN_IN_PATH } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "Forgot password · Orbit" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayoutBurner>
      <AuthCard
        title="Forgot password"
        intro="We will email a link so you can choose a new one."
        footer={
          <AuthLink href={SIGN_IN_PATH} tone="muted">
            Back to sign in
          </AuthLink>
        }
      >
        <ForgotPasswordForm />
      </AuthCard>
    </AuthLayoutBurner>
  );
}
