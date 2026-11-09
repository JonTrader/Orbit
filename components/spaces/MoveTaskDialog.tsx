"use client";

import { useId, useState, useTransition } from "react";

import { moveTask } from "@/lib/actions/tasks";
import type { section } from "@/lib/db/schema";

import { useActiveSpace } from "./ActiveSpaceProvider";
import { Dialog } from "./Dialog";

type SectionRow = typeof section.$inferSelect;

/**
 * Sections a Task can move into: Daily first, then Tasks / Mixed Sections in
 * layout order, excluding the Task's current Section.
 */
export function moveDestinations(
  sections: SectionRow[],
  currentSectionId: string,
): SectionRow[] {
  const candidates = sections.filter(
    (row) =>
      row.id !== currentSectionId &&
      (row.kind === "daily" || row.kind === "tasks" || row.kind === "mixed"),
  );
  return [
    ...candidates.filter((row) => row.kind === "daily"),
    ...candidates.filter((row) => row.kind !== "daily"),
  ];
}

interface MoveTaskDialogProps {
  spaceId: string;
  taskId: string;
  /** The Task's current Section; excluded from the destinations. */
  sectionId: string;
  onClose: () => void;
}

/**
 * Picks the Section to move a Task into. The server action enforces editor
 * access; the list only ever offers Sections from the Active Space layout.
 */
export function MoveTaskDialog({
  spaceId,
  taskId,
  sectionId,
  onClose,
}: MoveTaskDialogProps) {
  const { sections } = useActiveSpace();
  const groupName = useId();
  const destinations = moveDestinations(sections, sectionId);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Only ids from the filtered Active Space list; never trust stale state.
    if (
      !targetSectionId ||
      pending ||
      !destinations.some((row) => row.id === targetSectionId)
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await moveTask({ spaceId, taskId, targetSectionId });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title="Move Task"
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel="Move"
      pendingLabel="Moving…"
      submitDisabled={!targetSectionId}
      onSubmit={submit}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[0.8rem] font-semibold text-muted">
          Section
        </legend>
        {destinations.map((destination) => (
          <label
            key={destination.id}
            className="flex cursor-pointer items-center gap-2 text-[0.9rem] text-ink"
          >
            <input
              type="radio"
              name={groupName}
              value={destination.id}
              checked={targetSectionId === destination.id}
              onChange={() => setTargetSectionId(destination.id)}
              disabled={pending}
              className="accent-accent"
            />
            {destination.name}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
