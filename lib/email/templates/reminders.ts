import { requireEnv } from "@/lib/env";
import { spaceSectionPath } from "@/lib/spaces/paths";

import { renderEmail, type RenderedEmail } from "./layout";

/** Fields the Reminder layout needs. The scan candidate satisfies this. */
export interface ReminderEmailInput {
  spaceId: string;
  spaceName: string;
  kind: "monthly_due" | "daily_nudge";
  period: string;
  recipientEmail: string;
  title: string;
  dueOn: string;
  daysBefore?: number;
}

/** Absolute Upcoming URL from trusted BETTER_AUTH_URL only. */
export function buildUpcomingUrl(spaceId: string): string {
  const base = requireEnv("BETTER_AUTH_URL", "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return new URL(spaceSectionPath(spaceId, "upcoming"), `${base}/`).toString();
}

function daysBeforeSentence(daysBefore: number): string {
  if (daysBefore === 0) return "This Reminder is on the day it is due.";
  if (daysBefore === 1) return "This Reminder is 1 day before it is due.";
  return `This Reminder is ${daysBefore} days before it is due.`;
}

/** Pure escaped Reminder email via the shared layout renderer. */
export function reminderEmail(
  candidate: ReminderEmailInput,
): RenderedEmail & { to: string } {
  const upcomingUrl = buildUpcomingUrl(candidate.spaceId);
  let subject: string;
  let paragraphs: string[];

  if (candidate.kind === "monthly_due") {
    const daysBefore = candidate.daysBefore ?? 3;
    subject = `Orbit Reminder: ${candidate.title} is due ${candidate.dueOn}`;
    paragraphs = [
      `The Monthly "${candidate.title}" in ${candidate.spaceName} is due on ${candidate.dueOn}.`,
      daysBeforeSentence(daysBefore),
    ];
  } else if (candidate.dueOn === candidate.period) {
    subject = `Orbit Reminder: ${candidate.title} is due today`;
    paragraphs = [
      `The Task "${candidate.title}" in ${candidate.spaceName} is due today (${candidate.dueOn}).`,
    ];
  } else if (candidate.dueOn < candidate.period) {
    subject = `Orbit Reminder: ${candidate.title} is overdue`;
    paragraphs = [
      `The Task "${candidate.title}" in ${candidate.spaceName} was due on ${candidate.dueOn} and is overdue.`,
    ];
  } else {
    subject = `Orbit Reminder: ${candidate.title} is due ${candidate.dueOn}`;
    paragraphs = [
      `The Task "${candidate.title}" in ${candidate.spaceName} is due on ${candidate.dueOn}.`,
    ];
  }

  return {
    to: candidate.recipientEmail,
    ...renderEmail(subject, {
      heading: candidate.title,
      paragraphs,
      action: { label: "Open Upcoming", url: upcomingUrl },
      footer: "You can turn Reminder email off in this Space.",
    }),
  };
}
