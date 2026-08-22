import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { spaceSectionPath } from "@/lib/space-paths";

const spaceParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface SpaceIndexPageProps {
  params: Promise<{ spaceId: string }>;
}

/** Upcoming opens first in every Space, per the fixed nav order. */
export default async function SpaceIndexPage({ params }: SpaceIndexPageProps) {
  const parsed = spaceParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  redirect(spaceSectionPath(parsed.data.spaceId, "upcoming"));
}
