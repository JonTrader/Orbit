import { notFound } from "next/navigation";
import { z } from "zod";

import { ComposeBar } from "@/components/orbit/ComposeBar";
import { MonthlyRow } from "@/components/orbit/MonthlyRow";
import { SectionTabs } from "@/components/orbit/SectionTabs";
import { requireMembership } from "@/lib/authz/require-membership";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/space-nav";
import { spaceSectionPath } from "@/lib/space-paths";
import { listMonthlies } from "@/lib/services/monthlies";
import { listSections } from "@/lib/services/sections";
import { requireVerifiedSession } from "@/lib/session";

const spaceParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface MonthliesPageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * The Monthlies view: recurring monthly obligations of the Active Space in
 * due-date order. Completing one finishes the current period and advances
 * its next due date.
 */
export default async function MonthliesPage({ params }: MonthliesPageProps) {
  const parsed = spaceParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await requireVerifiedSession();
  const db = getDb();
  const userId = session.user.id;
  const spaceId = parsed.data.spaceId;

  const sections = await listSections(db, { userId, spaceId });
  const monthliesSection = sections.find(
    (row) => row.isSystem && row.kind === "monthlies",
  );
  if (!monthliesSection) notFound();

  const [monthlies, membership] = await Promise.all([
    listMonthlies(db, { userId, spaceId }),
    requireMembership(db, { userId, spaceId }),
  ]);

  const canMutate = membership.role !== "read-only";
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
                canMutate={canMutate}
              />
            ))
          )}
        </div>
      </div>

      {canMutate ? (
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
