import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { spaceSectionPath } from "@/lib/space-paths";
import { listSpaces } from "@/lib/services/spaces";
import { requireVerifiedSession } from "@/lib/session";

/**
 * Entry route: forwards to the user's default Active Space, straight into its
 * Upcoming view so no redirect page runs a second render pass. The (app)
 * layout guarantees the Personal Space exists before this runs.
 */
export default async function HomePage() {
  const session = await requireVerifiedSession();
  const spaces = await listSpaces(getDb(), session.user.id);
  const defaultSpace = spaces[0];

  if (!defaultSpace) {
    throw new Error("No Spaces found for user after onboarding");
  }

  redirect(spaceSectionPath(defaultSpace.id, "upcoming"));
}
