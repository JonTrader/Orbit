import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { CompletedTasksSection } from "@/components/spaces/CompletedTasksSection";
import { TaskRow } from "@/components/spaces/TaskRow";
import { getDb } from "@/lib/db/client";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listTasks } from "@/lib/services/tasks";

interface DailyPageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * The Daily view: day-to-day Tasks of the Active Space. Completed Tasks stay
 * completed until someone reopens them and are hidden behind an explicit
 * show-completed control owned by CompletedTasksSection on the client.
 */
export default async function DailyPage({ params }: DailyPageProps) {
  const spaceId = await resolveSpaceContext(params);
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
                canMutate={viewer.can.mutateContent}
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
          canMutate={viewer.can.mutateContent}
        />
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
