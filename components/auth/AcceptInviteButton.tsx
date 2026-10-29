"use client";

import { useState, type FormEvent } from "react";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { acceptInvite } from "@/lib/actions/invites";
import { NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";

import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

/** Accepts the pending Invite from the HttpOnly cookie (no client bearer). */
export function AcceptInviteButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await acceptInvite();
      // Successful accept redirects on the server. Keep pending so a
      // consumed-token preview cannot paint an error state.
      if (result.ok) return;
      setPending(false);
      setError(result.error.message);
    } catch (error) {
      // `redirect()` rejects with NEXT_REDIRECT; rethrow so the client
      // navigation runs. An empty catch leaves Joining… stuck on this page.
      if (isRedirectError(error)) throw error;
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending} pendingLabel="Joining…">
        Accept Invite
      </SubmitButton>
    </form>
  );
}
