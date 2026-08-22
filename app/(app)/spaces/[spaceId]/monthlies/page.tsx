import { notFound } from "next/navigation";
import { z } from "zod";

import { SectionTabs } from "@/components/orbit/SectionTabs";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/space-nav";
import { spaceSectionPath } from "@/lib/space-paths";
import { listSections } from "@/lib/services/sections";
import { requireVerifiedSession } from "@/lib/session";

const spaceParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface MonthliesPageProps {
  params: Promise<{ spaceId: string }>;
}

/** Recurring monthly obligations; completing one advances its next due. */
export default async function MonthliesPage({ params }: MonthliesPageProps) {
  const parsed = spaceParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await requireVerifiedSession();
  const spaceId = parsed.data.spaceId;
  const sections = await listSections(getDb(), {
    userId: session.user.id,
    spaceId,
  });

  return (
    <>
      <SectionTabs
        items={buildSpaceNav(spaceId, sections)}
        activeHref={spaceSectionPath(spaceId, "monthlies")}
      />
      <div className="overflow-hidden rounded border border-line bg-panel">
        <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          Monthlies
        </div>
        <div className="border-t border-line px-4 py-10 text-center text-[0.9rem] text-muted">
          No Monthlies yet.
        </div>
      </div>
    </>
  );
}
