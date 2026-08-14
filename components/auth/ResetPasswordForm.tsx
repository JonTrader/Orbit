"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth-client";
import { SIGN_IN_PATH } from "@/lib/auth-paths";

import { Field, FormMessage, SubmitButton } from "./ui";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    if (password !== String(form.get("confirm") ?? "")) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      setPending(false);

      if (failure) {
        setError(failure.message ?? "That reset link is no longer valid.");
        return;
      }

      router.push(SIGN_IN_PATH);
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
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
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending}>Save password</SubmitButton>
    </form>
  );
}
