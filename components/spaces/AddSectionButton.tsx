"use client";

import { useState, useTransition } from "react";

import { createSection } from "@/lib/actions/sections";

import { Dialog, DialogField, DialogRadioPills } from "./Dialog";

interface AddSectionButtonProps {
  spaceId: string;
  disabled?: boolean;
}

/**
 * Triggers the Add Section dialog. Editors and Owners use this to create
 * custom Sections (tasks, notes, or mixed) in the Active Space.
 */
export function AddSectionButton({
  spaceId,
  disabled = false,
}: AddSectionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Add Section"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded border border-line bg-panel px-2 py-1.5 text-[0.85rem] font-semibold text-muted transition-colors hover:border-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        <span className="sr-only">Add Section</span>
      </button>

      {open ? (
        <AddSectionDialog spaceId={spaceId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

interface AddSectionDialogProps {
  spaceId: string;
  onClose: () => void;
}

const SECTION_KINDS = [
  { value: "tasks", label: "Tasks" },
  { value: "notes", label: "Notes" },
  { value: "mixed", label: "Mixed" },
] as const;

type SectionKind = (typeof SECTION_KINDS)[number]["value"];

function AddSectionDialog({ spaceId, onClose }: AddSectionDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SectionKind>("tasks");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await createSection({
        spaceId,
        name: trimmed,
        kind,
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title="Add Section"
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel="Add Section"
      pendingLabel="Adding…"
      submitDisabled={!name.trim()}
      onSubmit={submit}
    >
      <DialogField label="Name" htmlFor="section-name">
        <input
          id="section-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Shopping"
          disabled={pending}
          autoFocus
          className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      </DialogField>

      <DialogRadioPills
        name="section-kind"
        label="Kind"
        value={kind}
        options={SECTION_KINDS}
        onChange={setKind}
        disabled={pending}
      />
    </Dialog>
  );
}
