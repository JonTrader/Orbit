import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { CompletedTasksSection } from "@/components/spaces/CompletedTasksSection";
import { TaskRow } from "@/components/spaces/TaskRow";
import { getDb } from "@/lib/db/client";
import { getActiveSpace } from "@/lib/spaces/active-space";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { fetchTasks } from "@/lib/spaces/queries/fetch-tasks";

import DailyLoading from "./loading";

interface DailyPageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * The Daily view: day-to-day Tasks of the Active Space. Completed Tasks stay
 * completed until someone reopens them and are hidden behind an explicit
 * show-completed control owned by CompletedTasksSection on the client.
 *
 * The task list streams in behind Suspense; the route's loading.tsx does
 * double duty as the fallback so there is one skeleton per route. The
 * compose bar rides inside the slot so it appears with the real panel.
 */
export default async function DailyPage({ params }: DailyPageProps) {
  const spaceId = await resolveSpaceContext(params);
  const { viewer, sections } = await getActiveSpace(spaceId);
  const daily = sections.find((row) => row.isSystem && row.kind === "daily");
  if (!daily) notFound();

  return (
    <>
      <Suspense fallback={<DailyLoading />}>
        <DailyTasks
          spaceId={spaceId}
          sectionId={daily.id}
          canMutate={viewer.can.mutateContent}
        />
        {viewer.can.mutateContent ? (
          <ComposeBar
            spaceId={spaceId}
            sectionId={daily.id}
            label="Add to Daily"
          />
        ) : null}
      </Suspense>
    </>
  );
}

interface DailyTasksProps {
  spaceId: string;
  sectionId: string;
  canMutate: boolean;
}

/**
 * One read feeds every Daily block: the "N open" counter and open rows live
 * in the panel; completed rows land below it via CompletedTasksSection. They
 * share this single fetchTasks call, so the section cannot be split into
 * independent Suspense slots without paying for the query twice.
 */
async function DailyTasks({
  spaceId,
  sectionId,
  canMutate,
}: DailyTasksProps) {
  const tasks = await fetchTasks(getDb(), { spaceId, sectionId });

  const openTasks = tasks.filter((row) => !row.completedAt);
  const completedTasks = tasks.filter((row) => row.completedAt);

  return (
    <>
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
        <CompletedTasksSection
          spaceId={spaceId}
          tasks={completedTasks.map((task) => ({
            id: task.id,
            title: task.title,
            dueOn: task.dueOn,
          }))}
          canMutate={canMutate}
        />
      ) : null}
    </>
  );
}
