import { redirect } from "next/navigation";

import { continuationFromSearchParams } from "@/lib/auth/paths";
import {
  readCreatorTimeZone,
  requireVerifiedSession,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveEntrySpace } from "@/lib/onboarding";
import { spaceSectionPath } from "@/lib/spaces/paths";

/**
 * Authenticated entry: ensure onboarding, honor a validated Invite
 * continuation, or open Upcoming in the default Active Space.
 */
export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params, timezone] = await Promise.all([
    requireVerifiedSession(),
    searchParams,
    readCreatorTimeZone(),
  ]);
  const spaceId = await resolveEntrySpace(getDb(), {
    userId: session.user.id,
    timezone,
  });
  const continuation = continuationFromSearchParams(params);

  redirect(continuation ?? spaceSectionPath(spaceId, "upcoming"));
}
