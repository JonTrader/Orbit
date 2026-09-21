import type { ReactNode } from "react";

import { requireVerifiedSession } from "@/lib/auth/session";

/**
 * App shell session gate. Pages re-check the session themselves because a
 * layout does not re-render on client navigation. Onboarding (Personal Space
 * creation) runs on `/spaces` via resolveEntrySpace, not here.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireVerifiedSession();
  return children;
}
