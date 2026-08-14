"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth-client";
import { APP_PATH } from "@/lib/auth-paths";

import { Field, FormMessage, SubmitButton } from "./ui";

const MIN_PASSWORD_LENGTH = 8;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "That current password is not correct.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "This account signs in with Google or Microsoft, so there is no password to change.",
};

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("password") ?? "");

    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("Those passwords do not match.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (!failure) {
        router.replace(APP_PATH);
        router.refresh();
        return;
      }

      setPending(false);
      setError(
        (failure.code && ERROR_MESSAGES[failure.code]) ??
          failure.message ??
          "Could not change your password.",
      );
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending}>Change password</SubmitButton>
    </form>
  );
}
