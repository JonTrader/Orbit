import Link from "next/link";

import { hasCredentialAccount } from "@/lib/auth/access";
import { CHANGE_PASSWORD_PATH } from "@/lib/auth/paths";
import { getDb } from "@/lib/db/client";

interface PasswordLinkSlotProps {
  userId: string;
}

/**
 * The sidebar's "Change password" link, streamed separately: this one DB
 * round trip must not block any content the user came to see. Rendered
 * inside <Suspense> by the Space layout and passed down as a plain prop,
 * because server components cannot live inside client-component trees.
 */
export async function PasswordLinkSlot({ userId }: PasswordLinkSlotProps) {
  const canChangePassword = await hasCredentialAccount(getDb(), userId);
  if (!canChangePassword) return null;

  return (
    <Link
      href={CHANGE_PASSWORD_PATH}
      className="rounded px-2 py-1.5 text-left text-[0.8rem] font-medium text-muted hover:bg-panel/60 hover:text-ink"
    >
      Change password
    </Link>
  );
}
