"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { updateTask } from "@/lib/actions/tasks";
import { toggleComplete } from "@/lib/actions/toggle-complete";

import { Button } from "./Button";
import { DatePicker } from "./DatePicker";

interface TaskRowProps {
  spaceId: string;
  taskId: string;
  title: string;
  dueOn: string | null;
  completed: boolean;
  canMutate: boolean;
}

/** Formats YYYY-MM-DD as a short UTC label such as "Sep 1". */
function formatDueDate(dueOn: string): string {
  const [year, month, day] = dueOn.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * One checklist row; the checkbox toggles completion in place. The row owns
 * its completed state: it flips instantly on click and reconciles against
 * the action's returned entity, so settling never waits for a re-render.
 * Editors open a carbon-copy form under the still-visible item; Escape cancels.
 */
export function TaskRow({
  spaceId,
  taskId,
  title,
  dueOn,
  completed,
  canMutate,
}: TaskRowProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const [shownCompleted, setShownCompleted] = useState(completed);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDueOn, setDraftDueOn] = useState(dueOn ?? "");
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) titleRef.current?.focus();
  }, [isEditing]);

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

  function startEdit() {
    setDraftTitle(title);
    setDraftDueOn(dueOn ?? "");
    setEditError(null);
    setSaveFailed(false);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditError(null);
  }

  function save() {
    if (pending) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setEditError("Task title cannot be empty");
      return;
    }

    setEditError(null);
    startTransition(async () => {
      const result = await updateTask({
        spaceId,
        taskId,
        title: trimmedTitle,
        dueOn: draftDueOn === "" ? null : draftDueOn,
      });
      if (result.ok) {
        setIsEditing(false);
      } else {
        setEditError(result.error.message);
      }
    });
  }

  return (
    <div
      className={[
        "border-b border-line px-4 py-3 last:border-b-0",
        pending && !isEditing ? "opacity-60" : "",
        shownCompleted ? "text-muted" : "",
        isEditing
          ? "bg-[color-mix(in_srgb,var(--bg)_35%,var(--panel))]"
          : "",
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
            {formatDueDate(dueOn)}
          </span>
        ) : null}
        {canMutate && !isEditing ? (
          <button
            type="button"
            onClick={startEdit}
            disabled={pending}
            aria-label={`Edit ${title}`}
            className="inline-flex shrink-0 items-center rounded border-0 bg-transparent px-[0.35rem] py-[0.2rem] text-[0.72rem] font-semibold leading-none text-muted hover:text-ink disabled:opacity-50"
          >
            Edit
          </button>
        ) : null}
      </div>
      {isEditing && canMutate ? (
        <form
          aria-label={`Edit ${title}`}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) {
              event.preventDefault();
              cancelEdit();
            }
          }}
          className="mb-[0.15rem] ml-8 mt-[0.65rem] border border-line border-l-2 border-l-accent bg-bg px-[0.85rem] py-3 max-sm:ml-2"
        >
          <p className="mb-[0.55rem] font-mono text-[0.58rem] uppercase tracking-[0.08em] text-muted">
            Copy · Edit Task
          </p>
          <input
            ref={titleRef}
            id={titleId}
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-label="Task title"
            disabled={pending}
            className="mb-[0.45rem] w-full rounded border border-line bg-panel px-[0.7rem] py-2 text-[0.92rem] font-medium outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          />
          <DatePicker
            label="Due date (optional)"
            value={draftDueOn}
            onChange={setDraftDueOn}
            disabled={pending}
            className="mb-[0.45rem]"
          />
          <div className="flex flex-wrap items-center gap-[0.4rem]">
            <Button
              type="submit"
              pending={pending}
              pendingLabel="Saving…"
              className="rounded bg-ink px-[0.75rem] py-[0.32rem] text-[0.76rem] font-semibold text-white hover:bg-[#3a3631] disabled:opacity-50"
            >
              Save
            </Button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded bg-transparent px-[0.45rem] py-[0.32rem] text-[0.76rem] font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {editError ? (
            <p role="alert" className="mt-[0.45rem] text-[0.8rem] font-medium text-accent">
              {editError}
            </p>
          ) : null}
        </form>
      ) : null}
      {saveFailed ? (
        <p role="alert" className="mt-1 pl-8 text-[0.75rem] font-medium text-accent">
          Could not save that change. Try again.
        </p>
      ) : null}
    </div>
  );
}
