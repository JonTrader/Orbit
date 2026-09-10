"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { acceptInvite } from "@/lib/actions/invites";
import { spaceSectionPath } from "@/lib/spaces/paths";

import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptInvite({ token });
      if (result.ok) {
        router.replace(spaceSectionPath(result.data.spaceId, "upcoming"));
        return;
      }
      setError(result.error.message);
    });
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
