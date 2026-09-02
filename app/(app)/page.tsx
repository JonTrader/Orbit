import { redirect } from "next/navigation";

import { requireVerifiedSession, readCreatorTimeZone } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveEntrySpace } from "@/lib/onboarding";
import { spaceSectionPath } from "@/lib/spaces/paths";

/**
 * Entry route: forwards to the user's default Active Space, straight into its
 * Upcoming view so no redirect page runs a second render pass.
 *
 * resolveEntrySpace idempotently ensures a Personal Space when the user has
 * none yet, so this page does not depend on the (app) layout's concurrent
 * onboarding finishing first.
 */
export default async function HomePage() {
  const session = await requireVerifiedSession();
  const spaceId = await resolveEntrySpace(getDb(), {
    userId: session.user.id,
    timezone: await readCreatorTimeZone(),
  });
  redirect(spaceSectionPath(spaceId, "upcoming"));
}
