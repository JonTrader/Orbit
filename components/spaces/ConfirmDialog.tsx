"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { ActionResult } from "@/lib/actions/result";

import { Dialog, DialogField } from "./Dialog";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  /** When set, submit stays disabled until the input matches exactly. */
  confirmPhrase?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
  onConfirmed: () => void;
  onClose: () => void;
}

/**
 * Destructive confirm dialog. Spaces pass `confirmPhrase` (typed name);
 * Sections omit it for a one-step confirm. Also used for ShareBar transfer /
 * remove / leave confirms.
 */
export function ConfirmDialog({
  title,
  description,
  confirmPhrase,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  onConfirm,
  onConfirmed,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const phraseRequired = confirmPhrase !== undefined;
  const phraseMatched = !phraseRequired || typed === confirmPhrase;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phraseMatched || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result.ok) {
        onConfirmed();
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel={confirmLabel}
      pendingLabel={pendingLabel}
      submitDisabled={!phraseMatched}
      tone="danger"
      onSubmit={submit}
    >
      <div className="text-[0.9rem] leading-relaxed text-muted">{description}</div>

      {phraseRequired ? (
        <DialogField
          label={`Type "${confirmPhrase}" to confirm`}
          htmlFor="confirm-delete-phrase"
        >
          <input
            id="confirm-delete-phrase"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            autoFocus
            autoComplete="off"
            className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
          />
        </DialogField>
      ) : null}
    </Dialog>
  );
}
