import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { MonthlyRow } from "@/components/spaces/MonthlyRow";
import { getDb } from "@/lib/db/client";
import { getActiveSpace } from "@/lib/spaces/active-space";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { fetchMonthlies } from "@/lib/spaces/queries/fetch-monthlies";

import MonthliesLoading from "./loading";

interface MonthliesPageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * The Monthlies view: recurring monthly obligations of the Active Space in
 * due-date order. Completing one finishes the current period and advances
 * its next due date.
 *
 * The list streams in behind Suspense; the route's loading.tsx does double
 * duty as the fallback so there is one skeleton per route. The compose bar
 * rides inside the slot so it appears with the real panel.
 */
export default async function MonthliesPage({ params }: MonthliesPageProps) {
  const spaceId = await resolveSpaceContext(params);
  const { viewer, sections } = await getActiveSpace(spaceId);
  const monthliesSection = sections.find(
    (row) => row.isSystem && row.kind === "monthlies",
  );
  if (!monthliesSection) notFound();

  return (
    <>
      <Suspense fallback={<MonthliesLoading />}>
        <MonthliesList
          spaceId={spaceId}
          canMutate={viewer.can.mutateContent}
        />
        {viewer.can.mutateContent ? (
          <ComposeBar
            spaceId={spaceId}
            sectionId={monthliesSection.id}
            label="Add to Monthlies"
            requiresDueDay
            requiresBody
          />
        ) : null}
      </Suspense>
    </>
  );
}

interface MonthliesListProps {
  spaceId: string;
  canMutate: boolean;
}

/** The "N tracked" counter plus rows; data-dependent, so it lives here. */
async function MonthliesList({ spaceId, canMutate }: MonthliesListProps) {
  const monthlies = await fetchMonthlies(getDb(), spaceId);

  return (
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
              body={monthly.body}
              dueDayOfMonth={monthly.dueDayOfMonth}
              nextDueOn={monthly.nextDueOn}
              canMutate={canMutate}
            />
          ))
        )}
      </div>
    </div>
  );
}
