import { describe, expect, it } from "vitest";

import {
  addDays,
  advanceNextDueOn,
  calendarDateInTimeZone,
  daysBetween,
  formatCalendarDate,
  formatShortCalendarDate,
  InvalidCalendarDateError,
  nextDueOnForDueDay,
} from "@/lib/calendar-date";

describe("calendar-date", () => {
  // 07:30 UTC on Jan 15 is still Jan 14 evening in America/Los_Angeles (UTC-8).
  const aroundLaMidnight = new Date("2026-01-15T07:30:00.000Z");

  it("maps the same instant to different calendar days in UTC vs America/Los_Angeles", () => {
    expect(calendarDateInTimeZone(aroundLaMidnight, "UTC")).toEqual({
      year: 2026,
      month: 1,
      day: 15,
    });
    expect(
      calendarDateInTimeZone(aroundLaMidnight, "America/Los_Angeles"),
    ).toEqual({
      year: 2026,
      month: 1,
      day: 14,
    });
  });

  it("formats calendar dates as YYYY-MM-DD", () => {
    expect(
      formatCalendarDate(calendarDateInTimeZone(aroundLaMidnight, "UTC")),
    ).toBe("2026-01-15");
    expect(
      formatCalendarDate(
        calendarDateInTimeZone(aroundLaMidnight, "America/Los_Angeles"),
      ),
    ).toBe("2026-01-14");
  });

  it("keeps due day 31 in January when that day is today or still ahead", () => {
    expect(
      nextDueOnForDueDay(31, "UTC", new Date("2026-01-31T12:00:00.000Z")),
    ).toBe("2026-01-31");
    expect(
      nextDueOnForDueDay(31, "UTC", new Date("2026-01-15T12:00:00.000Z")),
    ).toBe("2026-01-31");
  });

  it("clamps due day 31 to the last day of February 2026", () => {
    expect(
      nextDueOnForDueDay(31, "UTC", new Date("2026-02-01T12:00:00.000Z")),
    ).toBe("2026-02-28");
  });

  it("rolls a due day already before today into leap-year February", () => {
    // Due day 31 on 2028-01-31 is today, so it stays in January.
    // Due day 30 is already before that day, so it rolls into February
    // and clamps to the 29th.
    const now = new Date("2028-01-31T12:00:00.000Z");
    expect(nextDueOnForDueDay(31, "UTC", now)).toBe("2028-01-31");
    expect(nextDueOnForDueDay(30, "UTC", now)).toBe("2028-02-29");
    expect(
      nextDueOnForDueDay(31, "UTC", new Date("2028-02-01T12:00:00.000Z")),
    ).toBe("2028-02-29");
  });

  it("keeps a day-of-month that is still ahead in the current month", () => {
    expect(
      nextDueOnForDueDay(15, "UTC", new Date("2026-04-01T12:00:00.000Z")),
    ).toBe("2026-04-15");
  });

  it("advances a stored due date by one month and clamps short months", () => {
    expect(advanceNextDueOn("2026-01-31", 31)).toBe("2026-02-28");
    expect(advanceNextDueOn("2028-01-31", 31)).toBe("2028-02-29");
    expect(advanceNextDueOn("2026-12-30", 30)).toBe("2027-01-30");
  });

  it("rejects a stored due date that is not YYYY-MM-DD", () => {
    expect(() => advanceNextDueOn("2026/01/31", 31)).toThrow(
      InvalidCalendarDateError,
    );
  });

  it("formats a short UTC label without a leading zero on the day", () => {
    expect(formatShortCalendarDate("2026-09-01")).toBe("Sep 1");
  });

  it("counts whole calendar days from start to end", () => {
    expect(
      daysBetween(
        { year: 2026, month: 9, day: 1 },
        { year: 2026, month: 9, day: 2 },
      ),
    ).toBe(1);
  });

  it("adds days across a month boundary, including a 3-day lookback", () => {
    expect(
      formatCalendarDate(addDays({ year: 2026, month: 1, day: 31 }, 1)),
    ).toBe("2026-02-01");
    expect(
      formatCalendarDate(addDays({ year: 2026, month: 3, day: 1 }, -3)),
    ).toBe("2026-02-26");
  });
});
