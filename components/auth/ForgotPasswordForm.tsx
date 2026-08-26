"use client";

import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import { RESET_PASSWORD_PATH } from "@/lib/auth/paths";

import { Field } from "@/components/auth/kit/AuthField";
import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.requestPasswordReset({
        email: String(form.get("email") ?? ""),
        redirectTo: RESET_PASSWORD_PATH,
      });

      setPending(false);

      if (failure) {
        setError(failure.message ?? "Could not start a password reset.");
        return;
      }

      setSent(true);
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  if (sent) {
    return (
      <FormMessage tone="info">
        If that address has an Orbit account, a reset link is on its way.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}
