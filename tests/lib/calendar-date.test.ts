import { describe, expect, it } from "vitest";

import {
  calendarDateInTimeZone,
  formatCalendarDate,
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
});
