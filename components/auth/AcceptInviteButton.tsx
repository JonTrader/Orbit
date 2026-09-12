"use client";

import { useState, type FormEvent } from "react";

import { acceptInvite } from "@/lib/actions/invites";

import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

export function AcceptInviteButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await acceptInvite({ token });
      // Successful accept redirects on the server. Keep pending so a
      // consumed-token preview cannot paint an error state.
      if (result.ok) return;
      setPending(false);
      setError(result.error.message);
    } catch {
      // `redirect()` rejects the action promise on the client while the
      // destination loads. Keep pending; do not treat navigation as failure.
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
