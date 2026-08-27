import { redirect } from "next/navigation";

import { requireVerifiedSession, readCreatorTimeZone } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ensurePersonalSpace } from "@/lib/onboarding";
import { spaceSectionPath } from "@/lib/spaces/paths";
import { listSpaces } from "@/lib/services/spaces";

/**
 * Entry route: forwards to the user's default Active Space, straight into its
 * Upcoming view so no redirect page runs a second render pass.
 *
 * The (app) layout also runs onboarding, but layouts and pages render
 * concurrently, so a brand-new user's first load can reach this page before
 * the layout's insert has landed. If no Space is listed yet, run onboarding
 * here (idempotent) and enter the Personal Space directly.
 */
export default async function HomePage() {
  const session = await requireVerifiedSession();
  const spaces = await listSpaces(getDb(), session.user.id);
  const defaultSpace = spaces[0];

  if (!defaultSpace) {
    const ensured = await ensurePersonalSpace(getDb(), {
      userId: session.user.id,
      timezone: await readCreatorTimeZone(),
    });
    redirect(spaceSectionPath(ensured.spaceId, "upcoming"));
  }

  redirect(spaceSectionPath(defaultSpace.id, "upcoming"));
}
