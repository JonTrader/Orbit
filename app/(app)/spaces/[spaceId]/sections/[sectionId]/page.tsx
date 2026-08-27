import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { CompletedTasksSection } from "@/components/spaces/CompletedTasksSection";
import { TaskRow } from "@/components/spaces/TaskRow";
import { getDb } from "@/lib/db/client";
import { resolveCustomSectionContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listTasks } from "@/lib/services/tasks";

import CustomSectionLoading from "./loading";

interface CustomSectionPageProps {
  params: Promise<{ spaceId: string; sectionId: string }>;
}

/**
 * Custom tasks Section view: checklist content in a user-created Section.
 * Completed Tasks stay completed until reopened and are hidden behind the
 * same show-completed control used by Daily.
 *
 * The task list streams in behind Suspense; the route's loading.tsx does
 * double duty as the fallback so there is one skeleton per route. The
 * compose bar rides inside the slot so it appears with the real panel.
 */
export default async function CustomSectionPage({
  params,
}: CustomSectionPageProps) {
  const { spaceId, sectionId } = await resolveCustomSectionContext(params);
  const viewer = await getSpaceViewer(spaceId);

  const sections = await getSpaceSections(spaceId);
  const section = sections.find(
    (row) => row.id === sectionId && !row.isSystem && row.kind === "tasks",
  );
  if (!section) notFound();

  return (
    <>
      <Suspense fallback={<CustomSectionLoading />}>
        <SectionTasks
          userId={viewer.userId}
          spaceId={spaceId}
          sectionId={sectionId}
          sectionName={section.name}
          canMutate={viewer.can.mutateContent}
        />
        {viewer.can.mutateContent ? (
          <ComposeBar
            spaceId={spaceId}
            sectionId={sectionId}
            label={`Add to ${section.name}`}
          />
        ) : null}
      </Suspense>
    </>
  );
}

interface SectionTasksProps {
  userId: string;
  spaceId: string;
  sectionId: string;
  sectionName: string;
  canMutate: boolean;
}

/**
 * One read feeds the open Task list and the completed list below it. They
 * share this single listTasks call, so the section cannot be split into
 * independent Suspense slots without paying for the query twice.
 */
async function SectionTasks({
  userId,
  spaceId,
  sectionId,
  sectionName,
  canMutate,
}: SectionTasksProps) {
  const tasks = await listTasks(getDb(), { userId, spaceId, sectionId });

  const openTasks = tasks.filter((row) => !row.completedAt);
  const completedTasks = tasks.filter((row) => row.completedAt);

  return (
    <>
      <div className="overflow-hidden rounded border border-line bg-panel">
        <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          {sectionName} · {openTasks.length} open
        </div>
        <div className="border-t border-line">
          {openTasks.length === 0 ? (
            <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
              Nothing in {sectionName} yet.
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
