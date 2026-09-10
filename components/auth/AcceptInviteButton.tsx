"use client";

import { useState, type FormEvent } from "react";

import { acceptInvite } from "@/lib/actions/invites";
import { spaceSectionPath } from "@/lib/spaces/paths";

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
    const result = await acceptInvite({ token });
    if (result.ok) {
      const href = spaceSectionPath(result.data.spaceId, "upcoming");
      // Full load, scheduled outside Next's action refresh, so an RSC
      // rerender of `/accept-invite` cannot cancel the navigation after
      // the Invite token is consumed.
      window.setTimeout(() => {
        window.location.assign(href);
      }, 0);
      return;
    }
    setPending(false);
    setError(result.error.message);
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
