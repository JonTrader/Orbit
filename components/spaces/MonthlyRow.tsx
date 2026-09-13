"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { updateMonthly } from "@/lib/actions/monthlies";
import { toggleComplete } from "@/lib/actions/toggle-complete";

import { Button } from "./Button";

interface MonthlyRowProps {
  spaceId: string;
  monthlyId: string;
  title: string;
  /** Optional Description stored as body; shown only on Monthlies rows. */
  body: string;
  /** Authored day of month, 1-31; used when editing. */
  dueDayOfMonth: number;
  /** Next due calendar day, YYYY-MM-DD in the Space timezone. */
  nextDueOn: string;
  canMutate: boolean;
}

/** Formats YYYY-MM-DD as a short UTC label such as "Sep 1". */
function formatDueDate(nextDueOn: string): string {
  const [year, month, day] = nextDueOn.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * One Monthly obligation. Completing finishes the current period and rolls
 * the next due forward, so the button is not a toggle: it acknowledges done
 * instantly, then adopts the advanced due date from the action's returned
 * entity without waiting for a re-render. Editors open a carbon-copy form
 * under the still-visible item (title, due day, Description); Escape cancels.
 */
export function MonthlyRow({
  spaceId,
  monthlyId,
  title,
  body,
  dueDayOfMonth,
  nextDueOn,
  canMutate,
}: MonthlyRowProps) {
  const titleId = useId();
  const dueDayId = useId();
  const bodyId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const [dueOn, setDueOn] = useState(nextDueOn);
  const [flashDone, setFlashDone] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDueDay, setDraftDueDay] = useState(String(dueDayOfMonth));
  const [draftBody, setDraftBody] = useState(body);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) titleRef.current?.focus();
  }, [isEditing]);

  function complete() {
    if (pending) return;
    setSaveFailed(false);
    setFlashDone(true);
    startTransition(async () => {
      const result = await toggleComplete({
        spaceId,
        entity: "monthly",
        entityId: monthlyId,
      });
      if (result.ok) {
        if (result.data.entity === "monthly") {
          setDueOn(result.data.monthly.nextDueOn);
        }
        setFlashDone(false);
      } else {
        setFlashDone(false);
        setSaveFailed(true);
      }
    });
  }

  function startEdit() {
    setDraftTitle(title);
    setDraftDueDay(String(dueDayOfMonth));
    setDraftBody(body);
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
      setEditError("Monthly title cannot be empty");
      return;
    }

    const parsedDueDay = Number(draftDueDay);
    if (!draftDueDay || !Number.isInteger(parsedDueDay)) {
      setEditError("A Monthly needs a due day of month from 1 through 31");
      return;
    }

    setEditError(null);
    startTransition(async () => {
      const result = await updateMonthly({
        spaceId,
        monthlyId,
        title: trimmedTitle,
        body: draftBody,
        dueDayOfMonth: parsedDueDay,
      });
      if (result.ok) {
        setDueOn(result.data.nextDueOn);
        setIsEditing(false);
      } else {
        setEditError(result.error.message);
      }
    });
  }

  const done = flashDone;

  return (
    <div
      className={[
        "border-b border-line px-4 py-3 last:border-b-0",
        pending && !isEditing ? "opacity-60" : "",
        isEditing
          ? "bg-[color-mix(in_srgb,var(--bg)_35%,var(--panel))]"
          : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-medium text-ink">
            {title}
          </div>
          {body ? (
            <div className="mt-[0.4rem] whitespace-pre-wrap text-[0.88rem] leading-[1.6] text-muted">
              {body}
            </div>
          ) : null}
        </div>
        <span
          className={[
            "inline-flex shrink-0 items-center font-mono text-[0.72rem] uppercase leading-none tracking-[0.05em]",
            done ? "text-teal" : "text-muted",
          ].join(" ")}
        >
          due {formatDueDate(dueOn)}
        </span>
        {canMutate ? (
          <button
            type="button"
            aria-label={`Mark ${title} done for this period`}
            disabled={pending}
            onClick={complete}
            className={[
              "inline-flex shrink-0 items-center rounded border px-2.5 py-1 text-[0.75rem] font-semibold leading-none",
              done
                ? "border-teal bg-teal text-white"
                : "border-line bg-panel hover:border-muted",
            ].join(" ")}
          >
            {done ? "✓ Done" : "Done"}
          </button>
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
            Copy · Edit Monthly
          </p>
          <div className="mb-[0.45rem] flex flex-col gap-[0.45rem] sm:flex-row sm:items-center">
            <input
              ref={titleRef}
              id={titleId}
              type="text"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              aria-label="Monthly title"
              disabled={pending}
              className="min-w-0 w-full rounded border border-line bg-panel px-[0.7rem] py-2 text-[0.92rem] font-medium outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 sm:flex-1"
            />
            <input
              id={dueDayId}
              type="number"
              min={1}
              max={31}
              value={draftDueDay}
              onChange={(event) => setDraftDueDay(event.target.value)}
              aria-label="Due day of month"
              disabled={pending}
              className="w-20 shrink-0 rounded border border-line bg-panel px-3 py-2 text-center font-mono text-sm outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            />
          </div>
          <textarea
            id={bodyId}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="Write something…"
            aria-label="Description"
            rows={3}
            disabled={pending}
            className="mb-[0.45rem] min-h-[4.5rem] w-full resize-y rounded border border-line bg-panel px-[0.7rem] py-2 text-[0.86rem] leading-[1.55] outline-none placeholder:text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
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
