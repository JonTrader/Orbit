import { SpacesDirectory } from "@/components/spaces/SpacesDirectory";
import { requireVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listSpaceDirectoryEntries } from "@/lib/services/spaces";

interface SpacesPageProps {
  searchParams: Promise<{ new?: string }>;
}

/**
 * Membership-scoped all-Spaces directory. Re-checks the verified session
 * (layouts do not re-run on client navigation), loads only the caller's
 * directory entries, and forwards `?new=space` into the client shell.
 */
export default async function SpacesPage({ searchParams }: SpacesPageProps) {
  const [session, params] = await Promise.all([
    requireVerifiedSession(),
    searchParams,
  ]);
  const entries = await listSpaceDirectoryEntries(getDb(), session.user.id);
  const openCreate = params.new === "space";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <SpacesDirectory entries={entries} openCreate={openCreate} />
    </main>
  );
}
