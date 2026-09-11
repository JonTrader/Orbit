"use client";

import { useState } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import { authCallbackUrl } from "@/lib/auth/paths";

import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

export function ResendVerification({
  email,
  continuation = null,
}: {
  email: string;
  continuation?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackURL = authCallbackUrl(continuation);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPending(true);
    setError(null);

    try {
      const { error: failure } = await authClient.sendVerificationEmail({
        email,
        callbackURL,
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
      {error ? <FormMessage>{error}</FormMessage> : null}
      {sent ? <FormMessage tone="info">New link sent.</FormMessage> : null}
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send another link
      </SubmitButton>
    </form>
  );
}
