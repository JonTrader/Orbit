"use client";

import { useState, useTransition } from "react";

import { toggleComplete } from "@/lib/actions/toggle-complete";

interface MonthlyRowProps {
  spaceId: string;
  monthlyId: string;
  title: string;
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
 * entity without waiting for a re-render.
 */
export function MonthlyRow({
  spaceId,
  monthlyId,
  title,
  nextDueOn,
  canMutate,
}: MonthlyRowProps) {
  const [pending, startTransition] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);
  const [dueOn, setDueOn] = useState(nextDueOn);
  const [flashDone, setFlashDone] = useState(false);

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

  const done = flashDone;

  return (
    <div
      className={[
        "border-b border-line px-4 py-3 last:border-b-0",
        pending ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-ink">
          {title}
        </span>
        <span
          className={[
            "font-mono text-[0.72rem] uppercase tracking-[0.05em]",
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
              "shrink-0 rounded border px-2.5 py-1 text-[0.75rem] font-semibold",
              done
                ? "border-teal bg-teal text-white"
                : "border-line bg-panel hover:border-muted",
            ].join(" ")}
          >
            {done ? "✓ Done" : "Done"}
          </button>
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
