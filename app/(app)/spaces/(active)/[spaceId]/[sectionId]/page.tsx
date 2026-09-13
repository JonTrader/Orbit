import { Suspense } from "react";
import { notFound } from "next/navigation";

import { ComposeBar } from "@/components/spaces/ComposeBar";
import { CompletedTasksSection } from "@/components/spaces/CompletedTasksSection";
import { NoteRow } from "@/components/spaces/NoteRow";
import { SectionPanelHeader } from "@/components/spaces/SectionPanelHeader";
import { TaskRow } from "@/components/spaces/TaskRow";
import { getDb } from "@/lib/db/client";
import { note, task } from "@/lib/db/schema";
import { getActiveSpace } from "@/lib/spaces/active-space";
import { resolveCustomSectionContext } from "@/lib/spaces/params";
import { fetchMixedSectionContent } from "@/lib/spaces/queries/fetch-mixed-section-content";
import { fetchNotes } from "@/lib/spaces/queries/fetch-notes";
import { fetchTasks } from "@/lib/spaces/queries/fetch-tasks";

import CustomSectionLoading from "./loading";

interface CustomSectionPageProps {
  params: Promise<{ spaceId: string; sectionId: string }>;
}

/**
 * Custom Section view: dispatches by the Section's kind. Tasks Sections use
 * the same checklist pattern as Daily; Notes Sections show plain-text Notes
 * with inline editing; Mixed Sections show Tasks and Notes together.
 *
 * The content streams in behind Suspense; the route's loading.tsx does
 * double duty as the fallback so there is one skeleton per route. The
 * compose bar rides inside the slot so it appears with the real panel.
 */
export default async function CustomSectionPage({
  params,
}: CustomSectionPageProps) {
  const { spaceId, sectionId } = await resolveCustomSectionContext(params);
  const { viewer, sections } = await getActiveSpace(spaceId);
  const section = sections.find(
    (row) => row.id === sectionId && !row.isSystem,
  );
  if (!section) notFound();

  const kind = section.kind;
  if (kind !== "tasks" && kind !== "notes" && kind !== "mixed") notFound();

  return (
    <>
      <Suspense fallback={<CustomSectionLoading />}>
        {kind === "tasks" ? (
          <SectionTasks
            spaceId={spaceId}
            sectionId={sectionId}
            sectionName={section.name}
            canMutate={viewer.can.mutateContent}
          />
        ) : kind === "notes" ? (
          <SectionNotes
            spaceId={spaceId}
            sectionId={sectionId}
            sectionName={section.name}
            canMutate={viewer.can.mutateContent}
          />
        ) : (
          <SectionMixed
            spaceId={spaceId}
            sectionId={sectionId}
            sectionName={section.name}
            canMutate={viewer.can.mutateContent}
          />
        )}
        {viewer.can.mutateContent ? (
          kind === "mixed" ? (
            // Each ComposeBar's own mt-3.5 provides the spacing, matching
            // single-compose pages exactly.
            <div className="flex flex-col">
              <ComposeBar
                spaceId={spaceId}
                sectionId={sectionId}
                label={`Add task to ${section.name}`}
                allowsDueOn
              />
              <ComposeBar
                spaceId={spaceId}
                sectionId={sectionId}
                label={`Add note to ${section.name}`}
                requiresBody
                asNote
              />
            </div>
          ) : (
            <ComposeBar
              spaceId={spaceId}
              sectionId={sectionId}
              label={`Add to ${section.name}`}
              requiresBody={kind === "notes"}
              allowsDueOn={kind === "tasks"}
            />
          )
        ) : null}
      </Suspense>
    </>
  );
}

interface SectionTasksProps {
  spaceId: string;
  sectionId: string;
  sectionName: string;
  canMutate: boolean;
}

/**
 * One read feeds the open Task list and the completed list below it. They
 * share this single fetchTasks call, so the section cannot be split into
 * independent Suspense slots without paying for the query twice.
 */
async function SectionTasks({
  spaceId,
  sectionId,
  sectionName,
  canMutate,
}: SectionTasksProps) {
  const tasks = await fetchTasks(getDb(), { spaceId, sectionId });

  const openTasks = tasks.filter((row) => !row.completedAt);
  const completedTasks = tasks.filter((row) => row.completedAt);

  return (
    <>
      <div className="overflow-hidden rounded border border-line bg-panel">
        <SectionPanelHeader
          spaceId={spaceId}
          sectionId={sectionId}
          sectionName={sectionName}
          meta={`${sectionName} · ${openTasks.length} open`}
          canMutate={canMutate}
        />
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

interface SectionNotesProps {
  spaceId: string;
  sectionId: string;
  sectionName: string;
  canMutate: boolean;
}

/**
 * One read lists all Notes in the Section. Notes have no completion state,
 * so the panel is a simple list with inline editing.
 */
async function SectionNotes({
  spaceId,
  sectionId,
  sectionName,
  canMutate,
}: SectionNotesProps) {
  const notes = await fetchNotes(getDb(), { spaceId, sectionId });

  return (
    <div className="overflow-hidden rounded border border-line bg-panel">
      <SectionPanelHeader
        spaceId={spaceId}
        sectionId={sectionId}
        sectionName={sectionName}
        meta={`${sectionName} · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
        canMutate={canMutate}
      />
      <div className="border-t border-line">
        {notes.length === 0 ? (
          <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
            Nothing in {sectionName} yet.
          </div>
        ) : (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              spaceId={spaceId}
              noteId={note.id}
              title={note.title}
              body={note.body}
              canMutate={canMutate}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SectionMixedProps {
  spaceId: string;
  sectionId: string;
  sectionName: string;
  canMutate: boolean;
}

type MixedItem =
  | { kind: "task"; data: typeof task.$inferSelect }
  | { kind: "note"; data: typeof note.$inferSelect };

/**
 * Mixed Section: open Tasks and Notes in one list, ordered like the tasks
 * and notes views (`sortOrder`, then creation time), followed by completed
 * Tasks behind the same show-completed control used by Daily. One content
 * query (two json_agg subqueries) feeds both lists.
 */
async function SectionMixed({
  spaceId,
  sectionId,
  sectionName,
  canMutate,
}: SectionMixedProps) {
  const { tasks, notes } = await fetchMixedSectionContent(getDb(), {
    spaceId,
    sectionId,
  });

  const openTasks = tasks.filter((row) => !row.completedAt);
  const completedTasks = tasks.filter((row) => row.completedAt);

  const items: MixedItem[] = [
    ...openTasks.map((task) => ({ kind: "task" as const, data: task })),
    ...notes.map((note) => ({ kind: "note" as const, data: note })),
  ].sort(
    (a, b) =>
      a.data.sortOrder - b.data.sortOrder ||
      a.data.createdAt.getTime() - b.data.createdAt.getTime() ||
      a.data.id.localeCompare(b.data.id),
  );

  return (
    <>
      <div className="overflow-hidden rounded border border-line bg-panel">
        <SectionPanelHeader
          spaceId={spaceId}
          sectionId={sectionId}
          sectionName={sectionName}
          meta={`${sectionName} · ${openTasks.length} open · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
          canMutate={canMutate}
        />
        <div className="border-t border-line">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
              Nothing in {sectionName} yet.
            </div>
          ) : (
            items.map((item) =>
              item.kind === "task" ? (
                <TaskRow
                  key={item.data.id}
                  spaceId={spaceId}
                  taskId={item.data.id}
                  title={item.data.title}
                  dueOn={item.data.dueOn}
                  completed={false}
                  canMutate={canMutate}
                />
              ) : (
                <NoteRow
                  key={item.data.id}
                  spaceId={spaceId}
                  noteId={item.data.id}
                  title={item.data.title}
                  body={item.data.body}
                  canMutate={canMutate}
                />
              ),
            )
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
