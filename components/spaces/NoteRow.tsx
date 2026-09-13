"use client";

import { useState, useTransition } from "react";

import { updateNote } from "@/lib/actions/notes";

import { Button } from "./Button";

interface NoteRowProps {
  spaceId: string;
  noteId: string;
  title: string;
  body: string;
  canMutate: boolean;
}

/**
 * One plain-text Note in a notes Section (mixed Sections arrive with G7).
 * Editors see an Edit button that swaps the row into inline editing; the
 * save runs through the updateNote Server Action and revalidates the Active
 * Space layout.
 */
export function NoteRow({
  spaceId,
  noteId,
  title,
  body,
  canMutate,
}: NoteRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraftTitle(title);
    setDraftBody(body);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function save() {
    if (pending) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setError("Note title cannot be empty");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateNote({
        spaceId,
        noteId,
        title: trimmedTitle,
        body: draftBody,
      });
      if (result.ok) {
        setIsEditing(false);
      } else {
        setError(result.error.message);
      }
    });
  }

  if (isEditing) {
    return (
      <div className="border-b border-line px-[1.15rem] py-4 last:border-b-0">
        <div className="flex flex-col gap-[0.65rem] py-[0.15rem]">
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Note title"
            disabled={pending}
            className="w-full rounded-md border border-line bg-bg px-3 py-[0.55rem] text-[0.92rem] font-medium outline-none focus:border-accent focus:bg-panel disabled:opacity-60"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="Write something…"
            rows={3}
            disabled={pending}
            className="min-h-[5rem] w-full resize-y rounded-md border border-line bg-bg px-3 py-[0.55rem] text-[0.86rem] leading-[1.6] outline-none focus:border-accent focus:bg-panel disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-[0.45rem] pt-[0.15rem]">
            <Button
              type="button"
              onClick={save}
              pending={pending}
              pendingLabel="Saving…"
              className="rounded bg-ink px-3 py-[0.32rem] text-[0.76rem] font-semibold text-white hover:bg-[#3a3631] disabled:opacity-50"
            >
              Save
            </Button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded border-0 bg-transparent px-[0.55rem] py-[0.32rem] text-[0.76rem] font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[0.8rem] font-medium text-accent">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line px-[1.15rem] py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.94rem] font-medium leading-[1.35] text-ink">
            {title}
          </div>
          {body ? (
            <div className="mt-[0.4rem] whitespace-pre-wrap text-[0.88rem] leading-[1.6] text-muted">
              {body}
            </div>
          ) : null}
        </div>
        {canMutate ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex shrink-0 items-center rounded border-0 bg-transparent px-[0.35rem] py-[0.2rem] text-[0.72rem] font-semibold leading-none text-muted hover:bg-[rgba(255,253,249,0.8)] hover:text-ink"
          >
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}
