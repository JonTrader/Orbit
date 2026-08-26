"use client";

import { useState, useTransition } from "react";

import { toggleComplete } from "@/lib/actions/toggle-complete";

interface TaskRowProps {
  spaceId: string;
  taskId: string;
  title: string;
  dueOn: string | null;
  completed: boolean;
  canMutate: boolean;
}

/**
 * One checklist row; the checkbox toggles completion in place. The row owns
 * its completed state: it flips instantly on click and reconciles against
 * the action's returned entity, so settling never waits for a re-render.
 */
export function TaskRow({
  spaceId,
  taskId,
  title,
  dueOn,
  completed,
  canMutate,
}: TaskRowProps) {
  const [pending, startTransition] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const [shownCompleted, setShownCompleted] = useState(completed);

  function toggle() {
    if (pending) return;
    const optimistic = !shownCompleted;
    setSaveFailed(false);
    setShownCompleted(optimistic);
    startTransition(async () => {
      const result = await toggleComplete({
        spaceId,
        entity: "task",
        entityId: taskId,
      });
      if (result.ok) {
        if (result.data.entity === "task") {
          setShownCompleted(result.data.task.completedAt !== null);
        }
      } else {
        setShownCompleted(!optimistic);
        setSaveFailed(true);
      }
    });
  }

  return (
    <div
      className={[
        "border-b border-line px-4 py-3 last:border-b-0",
        pending ? "opacity-60" : "",
        shownCompleted ? "text-muted" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {canMutate ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={shownCompleted}
            aria-label={shownCompleted ? `Reopen ${title}` : `Complete ${title}`}
            disabled={pending}
            onClick={toggle}
            className={[
              "grid size-5 shrink-0 place-items-center rounded border text-[0.7rem] font-bold",
              shownCompleted
                ? "border-accent bg-accent text-white"
                : "border-line bg-panel hover:border-muted",
            ].join(" ")}
          >
            {shownCompleted ? "✓" : ""}
          </button>
        ) : (
          <span
            aria-hidden
            className={[
              "size-5 shrink-0 rounded border",
              shownCompleted ? "border-accent bg-accent" : "border-line",
            ].join(" ")}
          />
        )}
        <span
          className={[
            "min-w-0 flex-1 truncate text-[0.95rem]",
            shownCompleted ? "line-through" : "font-medium text-ink",
          ].join(" ")}
        >
          {title}
        </span>
        {dueOn ? (
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.05em] text-muted">
            {dueOn}
          </span>
        ) : null}
      </div>
      {saveFailed ? (
        <p role="alert" className="mt-1 pl-8 text-[0.75rem] font-medium text-accent">
          Could not save that change. Try again.
        </p>
      ) : null}
    </div>
  );
}
