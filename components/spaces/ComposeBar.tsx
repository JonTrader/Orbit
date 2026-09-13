"use client";

import { useState, useTransition } from "react";

import { quickAdd } from "@/lib/actions/quick-add";

import { Button } from "./Button";
import { DatePicker } from "./DatePicker";

interface ComposeBarProps {
  spaceId: string;
  sectionId: string;
  /** Compose input label; also used as the placeholder. */
  label: string;
  /** Monthlies need an authored due day of month on every add. */
  requiresDueDay?: boolean;
  /** Notes take an optional plain-text body; Monthlies an optional Description. */
  requiresBody?: boolean;
  /** Tasks may take an optional one-time due date. */
  allowsDueOn?: boolean;
  /**
   * For mixed Sections only: create a Note instead of the default Task.
   * Ignored for other Section kinds.
   */
  asNote?: boolean;
}

/**
 * Quick-add form at the bottom of Daily, Monthlies, and custom Sections.
 * Layout matches the household-pad compose: underline title, compact date or
 * due-day, ink Add, optional Description as a second line. The input clears
 * the moment the request goes out; a failure restores what was typed.
 */
export function ComposeBar({
  spaceId,
  sectionId,
  label,
  requiresDueDay = false,
  requiresBody = false,
  allowsDueOn = false,
  asNote = false,
}: ComposeBarProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isNoteCompose = requiresBody && !requiresDueDay;

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
    const submittedBody = body;
    const submittedDueDay = dueDay;
    const submittedDueOn = dueOn;
    setTitle("");
    setBody("");
    setDueDay("");
    setDueOn("");
    setError(null);
    startTransition(async () => {
      const result = await quickAdd({
        spaceId,
        sectionId,
        title: submittedTitle,
        ...(requiresBody ? { body: submittedBody } : {}),
        ...(requiresDueDay ? { dueDayOfMonth: parsedDueDay } : {}),
        ...(allowsDueOn ? { dueOn: submittedDueOn === "" ? null : submittedDueOn } : {}),
        ...(asNote ? { asNote: true } : {}),
      });
      if (!result.ok) {
        setTitle(submittedTitle);
        setBody(submittedBody);
        setDueDay(submittedDueDay);
        setDueOn(submittedDueOn);
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="mt-3.5 overflow-hidden rounded border border-line bg-[color-mix(in_srgb,var(--bg)_55%,var(--panel))]">
      <form onSubmit={submit} className="px-4 pb-[0.95rem] pt-[0.65rem]">
        {isNoteCompose ? (
          <div className="flex flex-col gap-[0.55rem]">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${label}…`}
              aria-label={label}
              disabled={pending}
              className="w-full border-0 border-b border-line bg-transparent py-[0.35rem] text-[0.95rem] font-medium text-ink outline-none placeholder:text-muted placeholder:opacity-75 focus:border-accent disabled:opacity-60"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Body (optional)…"
              aria-label="Note body"
              rows={3}
              disabled={pending}
              className="min-h-[3.25rem] w-full resize-y border-0 bg-transparent py-[0.1rem] text-[0.86rem] leading-[1.55] text-muted outline-none placeholder:text-muted placeholder:opacity-75 focus:text-ink disabled:opacity-60"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                pending={pending}
                disabled={!title.trim()}
                className="rounded bg-ink px-[0.9rem] py-[0.4rem] text-[0.8rem] font-semibold text-white hover:bg-[#3a3631] disabled:opacity-50"
              >
                Add
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={[
                "grid items-center gap-[0.45rem]",
                allowsDueOn || requiresDueDay
                  ? "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  : "grid-cols-[minmax(0,1fr)_auto]",
              ].join(" ")}
            >
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={`${label}…`}
                aria-label={label}
                disabled={pending}
                className={[
                  "min-w-0 w-full border-0 border-b border-line bg-transparent py-[0.35rem] text-[0.95rem] font-medium text-ink outline-none placeholder:text-muted placeholder:opacity-75 focus:border-accent disabled:opacity-60",
                  allowsDueOn || requiresDueDay ? "col-span-2 sm:col-span-1" : "",
                ].join(" ")}
              />
              {allowsDueOn ? (
                <DatePicker
                  label="Due date (optional)"
                  value={dueOn}
                  onChange={setDueOn}
                  disabled={pending}
                  compact
                  className="min-w-0 w-full sm:w-auto"
                />
              ) : null}
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
                  className="w-[4.25rem] rounded border border-line bg-panel px-2 py-[0.4rem] text-center font-mono text-[0.78rem] outline-none placeholder:text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
                />
              ) : null}
              <Button
                type="submit"
                pending={pending}
                disabled={!title.trim()}
                className="justify-self-end rounded bg-ink px-[0.9rem] py-[0.4rem] text-[0.8rem] font-semibold text-white hover:bg-[#3a3631] disabled:opacity-50 sm:justify-self-auto"
              >
                Add
              </Button>
            </div>
            {requiresBody ? (
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Description (optional)…"
                aria-label="Description"
                rows={2}
                disabled={pending}
                className="mt-[0.45rem] min-h-[2.4rem] w-full resize-y border-0 bg-transparent py-[0.1rem] text-[0.86rem] leading-[1.5] text-muted outline-none placeholder:text-muted placeholder:opacity-75 focus:text-ink disabled:opacity-60"
              />
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-[0.4rem] text-[0.78rem] font-medium text-accent">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
