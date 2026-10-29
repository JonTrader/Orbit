"use client";

import { useId } from "react";

import { memberOptionLabel } from "@/lib/spaces/assignee-label";

import { useActiveSpace } from "./ActiveSpaceProvider";
import { DialogField } from "./Dialog";

const selectBase =
  "w-full rounded border border-line bg-panel outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export function AssigneePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
  /** Match DatePicker compact density in ComposeBar. */
  compact?: boolean;
}) {
  const id = useId();
  const { members } = useActiveSpace();
  const known = value !== null && members.some((m) => m.userId === value);

  const select = (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      aria-label={compact ? "Assignee" : undefined}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next === "" ? null : next);
      }}
      className={[
        selectBase,
        compact
          ? "h-[2.15rem] px-2 py-[0.4rem] text-[0.78rem]"
          : "px-[0.7rem] py-2 text-[0.92rem]",
      ].join(" ")}
    >
      <option value="">Unassigned</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {memberOptionLabel(member, members)}
        </option>
      ))}
      {value !== null && !known ? (
        <option value={value}>Former Member</option>
      ) : null}
    </select>
  );

  if (compact) {
    return select;
  }

  return (
    <DialogField label="Assignee" htmlFor={id}>
      {select}
    </DialogField>
  );
}
