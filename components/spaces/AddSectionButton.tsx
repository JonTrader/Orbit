"use client";

import { useState, useTransition } from "react";

import { createSection } from "@/lib/actions/sections";

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

function AddSectionDialog({ spaceId, onClose }: AddSectionDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"tasks" | "notes" | "mixed">("tasks");
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Section"
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 p-4 pt-24 sm:pt-32"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded border border-line bg-panel shadow-[0_16px_48px_rgba(28,25,23,0.12)]">
        <form onSubmit={submit} className="p-4">
          <h2 className="mb-3 text-[1rem] font-semibold text-ink">
            Add Section
          </h2>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="section-name"
                className="text-[0.8rem] font-semibold text-muted"
              >
                Name
              </label>
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
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[0.8rem] font-semibold text-muted">
                Kind
              </span>
              <div className="flex gap-2">
                {SECTION_KINDS.map((option) => (
                  <label
                    key={option.value}
                    className={[
                      "flex-1 cursor-pointer rounded border px-2 py-2 text-center text-[0.85rem]",
                      kind === option.value
                        ? "border-accent bg-accent/10 font-semibold text-ink"
                        : "border-line bg-panel text-muted hover:border-muted",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="section-kind"
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                      disabled={pending}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-[0.8rem] font-medium text-accent">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded px-3 py-1.5 text-[0.85rem] font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="rounded bg-ink px-3 py-1.5 text-[0.85rem] font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add Section"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
