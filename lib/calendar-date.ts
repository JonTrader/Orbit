export type CalendarDate = { year: number; month: number; day: number };

export function calendarDateInTimeZone(
  now: Date,
  timezone: string,
): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
}

export function formatCalendarDate(date: CalendarDate): string {
  return [date.year, date.month, date.day]
    .map((value, index) =>
      index === 0 ? String(value) : String(value).padStart(2, "0"),
    )
    .join("-");
}

/** A stored YYYY-MM-DD value that this module cannot read. */
export class InvalidCalendarDateError extends Error {
  constructor() {
    super("Monthly due date is invalid");
    this.name = "InvalidCalendarDateError";
  }
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

export function nextDueOnForDueDay(
  dueDayOfMonth: number,
  timezone: string,
  now: Date,
): string {
  const today = calendarDateInTimeZone(now, timezone);
  let year = today.year;
  let month = today.month;
  let day = Math.min(dueDayOfMonth, daysInMonth(year, month));

  if (compareCalendarDates({ year, month, day }, today) < 0) {
    ({ year, month } = nextMonth(year, month));
    day = Math.min(dueDayOfMonth, daysInMonth(year, month));
  }

  return formatCalendarDate({ year, month, day });
}

export function advanceNextDueOn(
  nextDueOn: string,
  dueDayOfMonth: number,
): string {
  const current = parseCalendarDate(nextDueOn);
  if (!current) {
    throw new InvalidCalendarDateError();
  }
  const { year, month } = nextMonth(current.year, current.month);
  return formatCalendarDate({
    year,
    month,
    day: Math.min(dueDayOfMonth, daysInMonth(year, month)),
  });
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

function nextMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
