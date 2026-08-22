import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

import { ComposeBar } from "@/components/orbit/ComposeBar";
import { SectionTabs } from "@/components/orbit/SectionTabs";
import { TaskRow } from "@/components/orbit/TaskRow";
import { requireMembership } from "@/lib/authz/require-membership";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/space-nav";
import { spaceSectionPath } from "@/lib/space-paths";
import { listSections } from "@/lib/services/sections";
import { listTasks } from "@/lib/services/tasks";
import { requireVerifiedSession } from "@/lib/session";

const dailyParamsSchema = z.object({
  spaceId: z.uuid(),
});

interface DailyPageProps {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ showCompleted?: string }>;
}

/**
 * The Daily view: day-to-day Tasks of the Active Space. Completed Tasks stay
 * completed until someone reopens them and are hidden behind an explicit
 * show-completed control.
 */
export default async function DailyPage({ params, searchParams }: DailyPageProps) {
  const [parsedParams, parsedQuery] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsedSpace = dailyParamsSchema.safeParse(parsedParams);
  if (!parsedSpace.success) notFound();

  const session = await requireVerifiedSession();
  const db = getDb();
  const userId = session.user.id;
  const spaceId = parsedSpace.data.spaceId;

  const sections = await listSections(db, { userId, spaceId });
  const daily = sections.find((row) => row.isSystem && row.kind === "daily");
  if (!daily) notFound();

  const [tasks, membership] = await Promise.all([
    listTasks(db, { userId, spaceId, sectionId: daily.id }),
    requireMembership(db, { userId, spaceId }),
  ]);

  const canMutate = membership.role !== "read-only";
  const openTasks = tasks.filter((row) => !row.completedAt);
  const completedTasks = tasks.filter((row) => row.completedAt);
  const showCompleted = parsedQuery.showCompleted === "1";

  const basePath = spaceSectionPath(spaceId, "daily");
  const toggleHref = showCompleted ? basePath : `${basePath}?showCompleted=1`;

  return (
    <>
      <SectionTabs
        items={buildSpaceNav(spaceId, sections)}
        activeHref={basePath}
      />

      <div className="overflow-hidden rounded border border-line bg-panel">
        <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          Daily · {openTasks.length} open
        </div>
        <div className="border-t border-line">
          {openTasks.length === 0 ? (
            <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
              Nothing for today yet.
            </div>
          ) : (
            openTasks.map((task) => (
              <TaskRow
                key={task.id}
                spaceId={spaceId}
                taskId={task.id}
                title={task.title}
                dueOn={task.dueOn}
                completed={false}
                canMutate={canMutate}
              />
            ))
          )}
        </div>
      </div>

      {completedTasks.length > 0 ? (
        <div className="mt-3">
          <Link
            href={toggleHref}
            className="text-[0.85rem] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            aria-expanded={showCompleted}
          >
            {showCompleted
              ? "Hide completed"
              : `Show completed (${completedTasks.length})`}
          </Link>
          {showCompleted ? (
            <div className="mt-2 overflow-hidden rounded border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)]">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  spaceId={spaceId}
                  taskId={task.id}
                  title={task.title}
                  dueOn={task.dueOn}
                  completed={true}
                  canMutate={canMutate}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canMutate ? (
        <ComposeBar
          spaceId={spaceId}
          sectionId={daily.id}
          label="Add to Daily"
        />
      ) : null}
    </>
  );
}
