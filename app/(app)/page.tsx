import { redirect } from "next/navigation";

import {
  CONTINUATION_PARAM,
  parseLocalContinuation,
} from "@/lib/auth/paths";
import { requireVerifiedSession, readCreatorTimeZone } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveEntrySpace } from "@/lib/onboarding";
import { spaceSectionPath } from "@/lib/spaces/paths";

/**
 * Entry route: forwards to the user's default Active Space, straight into its
 * Upcoming view so no redirect page runs a second render pass.
 *
 * resolveEntrySpace idempotently ensures a Personal Space when the user has
 * none yet before redirecting into their default Active Space. A validated
 * Invite continuation returns to accept-invite after that onboarding hop.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireVerifiedSession();
  const params = await searchParams;
  const rawContinue = params[CONTINUATION_PARAM];
  const continuation = parseLocalContinuation(
    Array.isArray(rawContinue) ? rawContinue[0] : rawContinue,
  );
  const spaceId = await resolveEntrySpace(getDb(), {
    userId: session.user.id,
    timezone: await readCreatorTimeZone(),
  });
  if (continuation) redirect(continuation);
  redirect(spaceSectionPath(spaceId, "upcoming"));
}
