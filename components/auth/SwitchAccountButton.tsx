"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient, NETWORK_ERROR_MESSAGE } from "@/lib/auth/client";
import { SIGN_IN_PATH, withContinuation } from "@/lib/auth/paths";

import { FormMessage } from "@/components/auth/kit/FormMessage";
import { SubmitButton } from "@/components/auth/kit/AuthSubmitButton";

/** Signs out and returns to sign-in with the Invite continuation preserved. */
export function SwitchAccountButton({
  continuation,
}: {
  continuation: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await authClient.signOut();
      router.replace(withContinuation(SIGN_IN_PATH, continuation));
    } catch {
      setPending(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <SubmitButton pending={pending} pendingLabel="Signing out…">
        Switch account
      </SubmitButton>
    </form>
  );
}
