"use client";

import { useState, useTransition } from "react";

import { updateNotificationPreference } from "@/lib/actions/notification-preferences";

import { Dialog, DialogField, DialogRadioPills } from "./Dialog";
import type { ShareBarReminderPreference } from "./ShareBar";

const EMAIL_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

/** True when the trimmed field is an integer from 0 through 30. */
function isReminderDays(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const days = Number(trimmed);
  return Number.isInteger(days) && days >= 0 && days <= 30;
}

/**
 * Per-Space Reminder preference for the signed-in Member. Days-before and
 * email on/off come from the Active Space layout so the dialog opens with
 * the saved values, then save through the preference Server Action.
 */
export function ReminderPrefsDialog({
  spaceId,
  reminder,
  onClose,
  onSaved,
}: {
  spaceId: string;
  reminder: ShareBarReminderPreference;
  onClose: () => void;
  onSaved: (reminder: ShareBarReminderPreference) => void;
}) {
  const [days, setDays] = useState(String(reminder.daysBefore));
  const [emailEnabled, setEmailEnabled] = useState(reminder.emailEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isReminderDays(days) || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await updateNotificationPreference({
        spaceId,
        daysBefore: Number(days),
        emailEnabled,
      });
      if (result.ok) {
        onSaved({
          daysBefore: result.data.daysBefore,
          emailEnabled: result.data.emailEnabled,
        });
        onClose();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog
      title="Reminders"
      onClose={onClose}
      pending={pending}
      error={error}
      submitLabel="Save"
      pendingLabel="Saving…"
      submitDisabled={!isReminderDays(days)}
      onSubmit={submit}
    >
      <DialogField label="Days before a Monthly" htmlFor="reminder-days">
        <input
          id="reminder-days"
          type="number"
          min={0}
          max={30}
          step={1}
          inputMode="numeric"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          disabled={pending}
          autoFocus
          className="rounded border border-line bg-page px-3 py-2 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      </DialogField>

      <DialogRadioPills
        name="reminder-email"
        label="Email"
        value={emailEnabled ? "on" : "off"}
        options={EMAIL_OPTIONS}
        onChange={(value) => setEmailEnabled(value === "on")}
        disabled={pending}
      />

      <p className="text-[0.8rem] text-muted">
        Email covers Monthlies this many days before they are due, and Daily
        Tasks that are due today or overdue.
      </p>
    </Dialog>
  );
}
