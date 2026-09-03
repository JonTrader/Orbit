"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSpace } from "@/lib/actions/spaces";
import { spaceSectionPath } from "@/lib/spaces/paths";

import { Dialog, DialogField } from "./Dialog";

interface CreateSpaceDialogProps {
  onClose: () => void;
}

/**
 * Create-Space dialog. Name is trimmed client-side before the Server Action;
 * timezone comes from the auth cookie inside the action. On success, navigates
 * to the new Space's Upcoming page.
 */
export function CreateSpaceDialog({ onClose }: CreateSpaceDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await createSpace({ name: trimmed });
      if (result.ok) {
        onClose();
        router.push(spaceSectionPath(result.data.id, "upcoming"));
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title="New Space"
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel="Create Space"
      pendingLabel="Creating…"
      submitDisabled={!name.trim()}
      onSubmit={submit}
    >
      <DialogField label="Name" htmlFor="space-name">
        <input
          id="space-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Family"
          disabled={pending}
          autoFocus
          className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      </DialogField>
    </Dialog>
  );
}
