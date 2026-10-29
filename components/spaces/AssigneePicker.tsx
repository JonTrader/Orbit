"use client";

import { useId } from "react";

import { memberOptionLabel } from "@/lib/spaces/assignee-label";

import { useActiveSpace } from "./ActiveSpaceProvider";
import { DialogField } from "./Dialog";

export function AssigneePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { members } = useActiveSpace();
  const known = value !== null && members.some((m) => m.userId === value);

  return (
    <DialogField label="Assignee" htmlFor={id}>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : next);
        }}
        className="w-full rounded border border-line bg-panel px-[0.7rem] py-2 text-[0.92rem] outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
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
    </DialogField>
  );
}
