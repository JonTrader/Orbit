"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/spaces/Button";
import { authClient } from "@/lib/auth/client";
import { SIGN_IN_PATH } from "@/lib/auth/paths";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);

    try {
      await authClient.signOut();
      router.push(SIGN_IN_PATH);
    } catch {
      // The sidebar has nowhere to show a message; just allow another attempt.
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={signOut}
      pending={pending}
      pendingLabel="Signing out…"
      className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink disabled:opacity-60"
    >
      Sign out
    </Button>
  );
}
