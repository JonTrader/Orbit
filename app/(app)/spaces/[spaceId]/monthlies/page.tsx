import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { MonthlyRow } from "@/components/spaces/MonthlyRow";
import { SectionTabs } from "@/components/spaces/SectionTabs";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { spaceSectionPath } from "@/lib/spaces/paths";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listMonthlies } from "@/lib/services/monthlies";

interface MonthliesPageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * The Monthlies view: recurring monthly obligations of the Active Space in
 * due-date order. Completing one finishes the current period and advances
 * its next due date.
 */
export default async function MonthliesPage({ params }: MonthliesPageProps) {
  const spaceId = await resolveSpaceContext(params);
  const viewer = await getSpaceViewer(spaceId);

  const sections = await getSpaceSections(spaceId);
  const monthliesSection = sections.find(
    (row) => row.isSystem && row.kind === "monthlies",
  );
  if (!monthliesSection) notFound();

  const monthlies = await listMonthlies(getDb(), {
    userId: viewer.userId,
    spaceId,
  });

  const basePath = spaceSectionPath(spaceId, "monthlies");

  return (
    <>
      <SectionTabs
        items={buildSpaceNav(spaceId, sections)}
        activeHref={basePath}
      />

      <div className="overflow-hidden rounded border border-line bg-panel">
        <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          Monthlies · {monthlies.length} tracked
        </div>
        <div className="border-t border-line">
          {monthlies.length === 0 ? (
            <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
              No Monthlies yet.
            </div>
          ) : (
            monthlies.map((monthly) => (
              <MonthlyRow
                key={monthly.id}
                spaceId={spaceId}
                monthlyId={monthly.id}
                title={monthly.title}
                nextDueOn={monthly.nextDueOn}
                canMutate={viewer.can.mutateContent}
              />
            ))
          )}
        </div>
      </div>

      {viewer.can.mutateContent ? (
        <ComposeBar
          spaceId={spaceId}
          sectionId={monthliesSection.id}
          label="Add to Monthlies"
          requiresDueDay
        />
      ) : null}
    </>
  );
}
