import {
  calendarDateInTimeZone,
  formatCalendarDate,
} from "@/lib/calendar-date";
import { getDb } from "@/lib/db/client";
import { resolveSpaceContext } from "@/lib/spaces/params";
import { getSpaceSections, getSpaceViewer } from "@/lib/spaces/viewer";
import { listMonthlies } from "@/lib/services/monthlies";
import { listTasks } from "@/lib/services/tasks";

interface UpcomingPageProps {
  params: Promise<{ spaceId: string }>;
}

interface UpcomingEntry {
  key: string;
  title: string;
  /** Due calendar day, YYYY-MM-DD in the Space timezone. */
  date: string;
  kindLabel: "Monthly" | "Task";
  sectionName: string | null;
}

interface DayGroup {
  label: string;
  entries: UpcomingEntry[];
  urgent: boolean;
}

/** Formats YYYY-MM-DD as a short UTC label such as "Aug 1". */
function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "In 4 days · Fri Aug 1" for future days, computed against Space today. */
function futureLabel(
  date: string,
  today: { year: number; month: number; day: number },
): string {
  const [year, month, day] = date.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(year, month - 1, day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      86_400_000,
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));

  return days === 1 ? `Tomorrow · ${weekday}` : `In ${days} days · ${weekday}`;
}

/**
 * The read-only Upcoming timeline: Monthlies by next due plus dated, open
 * Tasks across all Sections of the Active Space. Days are resolved in the
 * Space timezone; there is no compose because Upcoming is not a Section.
 */
export default async function UpcomingPage({ params }: UpcomingPageProps) {
  const spaceId = await resolveSpaceContext(params);
  const viewer = await getSpaceViewer(spaceId);
  const db = getDb();

  const [sections, monthlies, tasks] = await Promise.all([
    getSpaceSections(spaceId),
    listMonthlies(db, { userId: viewer.userId, spaceId }),
    listTasks(db, {
      userId: viewer.userId,
      spaceId,
      dueOn: "dated",
      status: "open",
    }),
  ]);

  const sectionNames = new Map(sections.map((s) => [s.id, s.name]));
  const today = calendarDateInTimeZone(new Date(), viewer.space.timezone);
  const todayIso = formatCalendarDate(today);

  const entries: UpcomingEntry[] = [
    ...monthlies.map((monthly) => ({
      key: `monthly-${monthly.id}`,
      title: monthly.title,
      date: monthly.nextDueOn,
      kindLabel: "Monthly" as const,
      sectionName: null,
    })),
    ...tasks.map((task) => ({
      key: `task-${task.id}`,
      title: task.title,
      date: task.dueOn as string,
      kindLabel: "Task" as const,
      sectionName: sectionNames.get(task.sectionId) ?? null,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date));

  const overdue = entries.filter((entry) => entry.date < todayIso);
  const dueToday = entries.filter((entry) => entry.date === todayIso);

  const futureByDate = new Map<string, UpcomingEntry[]>();
  for (const entry of entries) {
    if (entry.date <= todayIso) continue;
    const bucket = futureByDate.get(entry.date) ?? [];
    bucket.push(entry);
    futureByDate.set(entry.date, bucket);
  }

  const groups: DayGroup[] = [
    ...(overdue.length > 0
      ? [{ label: "Overdue", entries: overdue, urgent: true }]
      : []),
    ...(dueToday.length > 0
      ? [{ label: "Today", entries: dueToday, urgent: false }]
      : []),
    ...[...futureByDate.entries()].map(([date, groupEntries]) => ({
      label: futureLabel(date, today),
      entries: groupEntries,
      urgent: false,
    })),
  ];

  return (
    <>
      <div className="overflow-hidden rounded border border-line bg-panel">
        <div className="px-4 pb-1.5 pt-3.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted">
          Upcoming
        </div>
        <div className="border-t border-line">
          {groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-[0.9rem] text-muted">
              Nothing scheduled yet.
            </div>
          ) : (
            groups.map((group, index) => (
              <section key={group.label}>
                <div
                  className={[
                    "px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.06em]",
                    index > 0 ? "mt-1 border-t border-line" : "",
                    group.urgent ? "font-semibold text-accent" : "text-muted",
                  ].join(" ")}
                >
                  {group.label}
                </div>
                {group.entries.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0"
                  >
                    <span
                      className={[
                        "w-16 shrink-0 pt-0.5 text-right font-mono text-[0.72rem] uppercase tracking-wider",
                        group.urgent ? "text-accent" : "text-muted",
                      ].join(" ")}
                    >
                      {shortDate(entry.date)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.95rem] font-medium text-ink">
                        {entry.title}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[0.68rem] uppercase tracking-wider text-muted">
                        {entry.kindLabel}
                        {entry.sectionName ? ` · ${entry.sectionName}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
