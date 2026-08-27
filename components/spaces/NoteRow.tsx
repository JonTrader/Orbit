"use client";

import { useState, useTransition } from "react";

import { updateNote } from "@/lib/actions/notes";

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
      <div className="border-b border-line px-4 py-3 last:border-b-0">
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Note title"
            disabled={pending}
            className="w-full rounded border border-line bg-panel px-3 py-2 text-[0.95rem] font-medium outline-none focus:border-accent disabled:opacity-60"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="Write something…"
            rows={4}
            disabled={pending}
            className="w-full resize-y rounded border border-line bg-panel px-3 py-2 text-[0.9rem] leading-relaxed outline-none focus:border-accent disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded bg-ink px-3 py-1.5 text-[0.8rem] font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="rounded px-3 py-1.5 text-[0.8rem] font-semibold text-muted hover:text-ink disabled:opacity-50"
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
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-medium text-ink">
            {title}
          </div>
          {body ? (
            <div className="mt-1 whitespace-pre-wrap text-[0.9rem] leading-relaxed text-muted">
              {body}
            </div>
          ) : null}
        </div>
        {canMutate ? (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 rounded border border-line bg-panel px-2.5 py-1 text-[0.75rem] font-semibold text-muted hover:border-muted hover:text-ink"
          >
            Edit
          </button>
        ) : null}
      </div>
    </div>
  );
}
