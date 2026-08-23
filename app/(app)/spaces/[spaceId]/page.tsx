import { redirect } from "next/navigation";

import { spaceSectionPath } from "@/lib/space-paths";
import { resolveSpaceContext } from "@/lib/space-view";

interface SpaceIndexPageProps {
  params: Promise<{ spaceId: string }>;
}

/** Upcoming opens first in every Space, per the fixed nav order. */
export default async function SpaceIndexPage({ params }: SpaceIndexPageProps) {
  redirect(spaceSectionPath(await resolveSpaceContext(params), "upcoming"));
}
