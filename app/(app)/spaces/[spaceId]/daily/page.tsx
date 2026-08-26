import { notFound } from "next/navigation";
import Link from "next/link";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { SectionTabs } from "@/components/spaces/SectionTabs";
import { TaskRow } from "@/components/spaces/TaskRow";
import { getDb } from "@/lib/db/client";
import { buildSpaceNav } from "@/lib/spaces/nav";
import { spaceSectionPath } from "@/lib/spaces/paths";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listTasks } from "@/lib/services/tasks";

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
  const spaceId = await resolveSpaceContext(parsedParams);
  const viewer = await getSpaceViewer(spaceId);

  const sections = await getSpaceSections(spaceId);
  const daily = sections.find((row) => row.isSystem && row.kind === "daily");
  if (!daily) notFound();

  const tasks = await listTasks(getDb(), {
    userId: viewer.userId,
    spaceId,
    sectionId: daily.id,
  });

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
                canMutate={viewer.can.mutateContent}
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
                  canMutate={viewer.can.mutateContent}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {viewer.can.mutateContent ? (
        <ComposeBar
          spaceId={spaceId}
          sectionId={daily.id}
          label="Add to Daily"
        />
      ) : null}
    </>
  );
}
