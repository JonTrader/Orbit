import { SpacesDirectory } from "@/components/spaces/SpacesDirectory";
import {
  readCreatorTimeZone,
  requireVerifiedSession,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveEntrySpace } from "@/lib/onboarding";
import { listSpaceDirectoryEntries } from "@/lib/services/spaces";

interface SpacesDirectoryPageProps {
  searchParams: Promise<{ new?: string }>;
}

/**
 * Membership-scoped all-Spaces directory. Re-checks the verified session
 * (layouts do not re-run on client navigation), ensures onboarding before
 * loading entries, and forwards `?new=space` into the client shell.
 */
export default async function SpacesDirectoryPage({
  searchParams,
}: SpacesDirectoryPageProps) {
  const [session, params, timezone] = await Promise.all([
    requireVerifiedSession(),
    searchParams,
    readCreatorTimeZone(),
  ]);
  const db = getDb();
  const entrySpaceId = await resolveEntrySpace(db, {
    userId: session.user.id,
    timezone,
  });
  const entries = await listSpaceDirectoryEntries(db, session.user.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <SpacesDirectory
        entries={entries}
        entrySpaceId={entrySpaceId}
        openCreate={params.new === "space"}
      />
    </main>
  );
}
