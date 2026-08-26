"use client";

import { useState, useTransition } from "react";

import { quickAdd } from "@/lib/actions/quick-add";

interface ComposeBarProps {
  spaceId: string;
  sectionId: string;
  /** Compose input label; also used as the placeholder. */
  label: string;
  /** Monthlies need an authored due day of month on every add. */
  requiresDueDay?: boolean;
}

/**
 * Quick-add form targeting one Section of the Active Space. The input clears
 * the moment the request goes out; a failure restores what was typed. The
 * created row lands through the action's revalidation.
 */
export function ComposeBar({
  spaceId,
  sectionId,
  label,
  requiresDueDay = false,
}: ComposeBarProps) {
  const [title, setTitle] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;

    const parsedDueDay = Number(dueDay);
    if (requiresDueDay && (!dueDay || !Number.isInteger(parsedDueDay))) {
      setError("A Monthly needs a due day of month from 1 through 31");
      return;
    }

    const submittedTitle = trimmed;
    const submittedDueDay = dueDay;
    setTitle("");
    setDueDay("");
    setError(null);
    startTransition(async () => {
      const result = await quickAdd({
        spaceId,
        sectionId,
        title: submittedTitle,
        ...(requiresDueDay ? { dueDayOfMonth: parsedDueDay } : {}),
      });
      if (!result.ok) {
        setTitle(submittedTitle);
        setDueDay(submittedDueDay);
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="mt-3.5">
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`${label}…`}
          aria-label={label}
          disabled={pending}
          className="min-w-0 flex-1 rounded border border-line bg-panel px-3.5 py-2.5 text-base outline-none focus:border-accent disabled:opacity-60"
        />
        {requiresDueDay ? (
          <input
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            placeholder="Day"
            aria-label="Due day of month"
            disabled={pending}
            className="w-20 rounded border border-line bg-panel px-3 py-2.5 text-center font-mono text-sm outline-none focus:border-accent disabled:opacity-60"
          />
        ) : null}
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="rounded bg-ink px-4 text-[0.85rem] font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem] font-medium text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}
