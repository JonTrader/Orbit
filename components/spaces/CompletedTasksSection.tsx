"use client";

import { useState } from "react";

import { TaskRow } from "./TaskRow";

interface CompletedTask {
  id: string;
  title: string;
  dueOn: string | null;
}

interface CompletedTasksSectionProps {
  spaceId: string;
  tasks: CompletedTask[];
  canMutate: boolean;
}

/**
 * The Daily view's completed list with its show/hide control. The rows ship
 * with the page's initial response, so visibility is pure client state -
 * toggling never revisits the server.
 */
export function CompletedTasksSection({
  spaceId,
  tasks,
  canMutate,
}: CompletedTasksSectionProps) {
  const [showSection, setShowSection] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={showSection}
        onClick={() => setShowSection((visible) => !visible)}
        className="text-[0.85rem] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        {showSection ? "Hide completed" : `Show completed (${tasks.length})`}
      </button>
      {showSection ? (
        <div className="mt-2 overflow-hidden rounded border border-line bg-[color-mix(in_srgb,var(--panel)_70%,transparent)]">
          {tasks.map((task) => (
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
  );
}
