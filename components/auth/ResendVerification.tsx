"use client";

import { useState } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth-client";
import { APP_PATH } from "@/lib/auth-paths";

import { Field, FormMessage, SubmitButton } from "./ui";

export function ResendVerification({ email }: { email?: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.sendVerificationEmail({
        email: String(form.get("email") ?? ""),
        callbackURL: APP_PATH,
      });

      setPending(false);

      if (failure) {
        setError(failure.message ?? "Could not send another link.");
        return;
      }

      setSent(true);
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={email}
        required
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      {sent ? <FormMessage tone="info">New link sent.</FormMessage> : null}
      <SubmitButton pending={pending}>Send another link</SubmitButton>
    </form>
  );
}
