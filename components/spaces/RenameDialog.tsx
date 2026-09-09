"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/actions/result";

import { Dialog, DialogField } from "./Dialog";

interface RenameDialogProps {
  title: string;
  label: string;
  initialName: string;
  onRename: (name: string) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}

/**
 * Shared rename dialog for Spaces and Sections. Submit stays disabled while
 * the trimmed name is empty or unchanged from the initial value.
 */
export function RenameDialog({
  title,
  label,
  initialName,
  onRename,
  onClose,
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();
  const unchanged = trimmed === initialName.trim();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || unchanged || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await onRename(trimmed);
      if (result.ok) {
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
      submitLabel="Rename"
      pendingLabel="Renaming…"
      submitDisabled={!trimmed || unchanged}
      onSubmit={submit}
    >
      <DialogField label={label} htmlFor="rename-name">
        <input
          id="rename-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          autoFocus
          className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      </DialogField>
    </Dialog>
  );
}
