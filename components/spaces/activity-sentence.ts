import { formatShortCalendarDate } from "@/lib/calendar-date";
import type { ActivityEntry, ActivityFieldChange } from "@/lib/services/activity";
import { assigneeLabel } from "@/lib/spaces/assignee-label";
import type { SpaceMemberPreview } from "@/lib/spaces/viewer";

const FORMER_MEMBER = "Former Member";

/**
 * Plain-text Activity sentence. Monthly completion appends the calendar-day
 * period. Assignee names prefer the snapshot on the row, then current Members.
 */
export function formatActivitySentence(
  entry: ActivityEntry,
  members: readonly SpaceMemberPreview[] = [],
): string {
  const actor = actorLabel(entry.actorName);
  const title = activityTitle(entry);

  switch (entry.action) {
    case "created":
      return `${actor} created ${title}`;
    case "updated":
      return `${actor} updated ${title}`;
    case "assigned":
      return assignedSentence(
        actor,
        title,
        entry.details.changes?.assigneeId,
        members,
      );
    case "completed":
      if (entry.entityType === "monthly" && entry.period) {
        return `${actor} completed ${title} for ${formatShortCalendarDate(entry.period)}`;
      }
      return `${actor} completed ${title}`;
    case "reopened":
      return `${actor} reopened ${title}`;
    case "moved":
      return `${actor} moved ${title} to ${movedSectionName(entry)}`;
    case "deleted":
      return `${actor} deleted ${title}`;
    default: {
      const unexpected: never = entry.action;
      return unexpected;
    }
  }
}

/**
 * Short absolute instant in a Space timezone. Not a calendar-day helper:
 * `formatShortCalendarDate` stays on Monthly periods only.
 */
export function formatActivityTimestamp(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  };

  try {
    return normalizeTimestamp(new Intl.DateTimeFormat("en-US", options).format(date));
  } catch {
    return normalizeTimestamp(
      new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date),
    );
  }
}

function actorLabel(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : FORMER_MEMBER;
}

function activityTitle(entry: ActivityEntry): string {
  const title = entry.details?.title;
  return typeof title === "string" ? title : "";
}

function assignedSentence(
  actor: string,
  title: string,
  change: ActivityFieldChange | undefined,
  members: readonly SpaceMemberPreview[],
): string {
  if (change == null || change.to == null || change.to === "") {
    return `${actor} cleared the Assignee on ${title}`;
  }

  const snapped = change.toName?.trim();
  if (snapped) return `${actor} assigned ${title} to ${snapped}`;

  const lookedUp =
    typeof change.to === "string" ? assigneeLabel(change.to, members) : null;
  return `${actor} assigned ${title} to ${lookedUp ?? FORMER_MEMBER}`;
}

function movedSectionName(entry: ActivityEntry): string {
  const name = entry.details.toSectionName?.trim();
  return name ? name : "another Section";
}

/** Intl may use a narrow no-break space before AM/PM. */
function normalizeTimestamp(value: string): string {
  return value.replace(/[\u202f\u00a0]/g, " ");
}
