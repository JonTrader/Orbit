import type { ReactNode } from "react";

import { getDb } from "@/lib/db/client";
import { ensurePersonalSpace } from "@/lib/onboarding";
import { readCreatorTimeZone, requireVerifiedSession } from "@/lib/auth/session";

/**
 * Onboarding gate for the app shell. Pages re-check the session themselves,
 * because a layout does not re-render on client navigation. Layout and page
 * render concurrently, so pages that depend on the Personal Space existing
 * must not assume this has completed - see the entry route's fallback.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireVerifiedSession();

  await ensurePersonalSpace(getDb(), {
    userId: session.user.id,
    timezone: await readCreatorTimeZone(),
  });

  return children;
}
