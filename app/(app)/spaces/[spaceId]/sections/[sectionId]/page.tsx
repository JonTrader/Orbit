import { redirect } from "next/navigation";

import { customSectionPath } from "@/lib/spaces/paths";
import { resolveCustomSectionContext } from "@/lib/spaces/params";

interface LegacyCustomSectionPageProps {
  params: Promise<{ spaceId: string; sectionId: string }>;
}

/**
 * Legacy `/spaces/[spaceId]/sections/[sectionId]` bookmark redirect.
 * Custom Sections now live at `/spaces/[spaceId]/[sectionId]`.
 */
export default async function LegacyCustomSectionRedirect({
  params,
}: LegacyCustomSectionPageProps) {
  const { spaceId, sectionId } = await resolveCustomSectionContext(params);
  redirect(customSectionPath(spaceId, sectionId));
}
