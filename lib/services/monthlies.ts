import { and, asc, eq } from "drizzle-orm";

import { requireMembership } from "@/lib/authz/require-membership";
import type { OrbitDb } from "@/lib/db/client";
import { monthly, section, space, spaceMember } from "@/lib/db/schema";

export type MonthlyErrorCode =
  | "INVALID_ASSIGNEE"
  | "INVALID_DUE_DAY"
  | "INVALID_TITLE"
  | "INVALID_UPDATE"
  | "MONTHLY_NOT_FOUND"
  | "MONTHLIES_SECTION_NOT_FOUND";

export class MonthlyError extends Error {
  readonly name = "MonthlyError";

  constructor(
    readonly code: MonthlyErrorCode,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface MonthlyAccessInput {
  userId: string;
  spaceId: string;
}

export interface CreateMonthlyInput extends MonthlyAccessInput {
  title: string;
  dueDayOfMonth: number;
  assigneeId?: string | null;
}

export interface GetMonthlyInput extends MonthlyAccessInput {
  monthlyId: string;
}

export interface UpdateMonthlyInput extends GetMonthlyInput {
  title?: string;
  dueDayOfMonth?: number;
  assigneeId?: string | null;
}

type MonthlyRow = typeof monthly.$inferSelect;

/** Lists Monthlies in due-date order for a Space Member. */
export async function listMonthlies(
  db: OrbitDb,
  input: MonthlyAccessInput,
): Promise<MonthlyRow[]> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  return db
    .select()
    .from(monthly)
    .where(eq(monthly.spaceId, input.spaceId))
    .orderBy(asc(monthly.nextDueOn), asc(monthly.sortOrder), asc(monthly.id));
}

/** Gets one Monthly after confirming Space membership. */
export async function getMonthly(
  db: OrbitDb,
  input: GetMonthlyInput,
): Promise<MonthlyRow> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });
  return findMonthly(db, input.spaceId, input.monthlyId);
}

/** Creates a Monthly in the Space's system Monthlies Section. */
export async function createMonthly(
  db: OrbitDb,
  input: CreateMonthlyInput,
): Promise<MonthlyRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const title = normalizeMonthlyTitle(input.title);
  const dueDayOfMonth = validateDueDay(input.dueDayOfMonth);
  const monthliesSection = await findMonthliesSection(db, input.spaceId);
  const timezone = await findSpaceTimezone(db, input.spaceId);
  await validateAssignee(db, input.spaceId, input.assigneeId);

  const [created] = await db
    .insert(monthly)
    .values({
      spaceId: input.spaceId,
      sectionId: monthliesSection.id,
      sectionKind: "monthlies",
      title,
      dueDayOfMonth,
      nextDueOn: nextDueOnForDueDay(dueDayOfMonth, timezone, new Date()),
      assigneeId: input.assigneeId ?? null,
      createdBy: input.userId,
    })
    .returning();

  return created;
}

/** Updates Monthly fields while keeping it in Monthlies forever. */
export async function updateMonthly(
  db: OrbitDb,
  input: UpdateMonthlyInput,
): Promise<MonthlyRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  await findMonthly(db, input.spaceId, input.monthlyId);
  const updates: Partial<typeof monthly.$inferInsert> = {};

  if (input.title !== undefined) {
    updates.title = normalizeMonthlyTitle(input.title);
  }
  if (input.dueDayOfMonth !== undefined) {
    const dueDayOfMonth = validateDueDay(input.dueDayOfMonth);
    updates.dueDayOfMonth = dueDayOfMonth;
    const timezone = await findSpaceTimezone(db, input.spaceId);
    updates.nextDueOn = nextDueOnForDueDay(
      dueDayOfMonth,
      timezone,
      new Date(),
    );
  }
  if (input.assigneeId !== undefined) {
    await validateAssignee(db, input.spaceId, input.assigneeId);
    updates.assigneeId = input.assigneeId;
  }

  if (Object.keys(updates).length === 0) {
    throw new MonthlyError("INVALID_UPDATE", "Monthly update has no changes");
  }

  const [updated] = await db
    .update(monthly)
    .set(updates)
    .where(
      and(eq(monthly.id, input.monthlyId), eq(monthly.spaceId, input.spaceId)),
    )
    .returning();

  if (!updated) {
    throw new MonthlyError("MONTHLY_NOT_FOUND", "Monthly was not found");
  }

  return updated;
}

/** Deletes a Monthly from the Monthlies Section. */
export async function deleteMonthly(
  db: OrbitDb,
  input: GetMonthlyInput,
): Promise<MonthlyRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const [deleted] = await db
    .delete(monthly)
    .where(
      and(eq(monthly.id, input.monthlyId), eq(monthly.spaceId, input.spaceId)),
    )
    .returning();

  if (!deleted) {
    throw new MonthlyError("MONTHLY_NOT_FOUND", "Monthly was not found");
  }

  return deleted;
}

/**
 * Completes the current Monthly period and advances its next due date by one
 * calendar month, clamping authored days such as 31 to the month's last day.
 */
export async function completeMonthly(
  db: OrbitDb,
  input: GetMonthlyInput,
): Promise<MonthlyRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const current = await findMonthly(db, input.spaceId, input.monthlyId);

  const [completed] = await db
    .update(monthly)
    .set({
      nextDueOn: advanceNextDueOn(
        current.nextDueOn,
        current.dueDayOfMonth,
      ),
      lastCompletedAt: new Date(),
      lastCompletedBy: input.userId,
    })
    .where(
      and(eq(monthly.id, input.monthlyId), eq(monthly.spaceId, input.spaceId)),
    )
    .returning();

  if (!completed) {
    throw new MonthlyError("MONTHLY_NOT_FOUND", "Monthly was not found");
  }

  return completed;
}

async function findMonthly(
  db: OrbitDb,
  spaceId: string,
  monthlyId: string,
): Promise<MonthlyRow> {
  const [result] = await db
    .select()
    .from(monthly)
    .where(and(eq(monthly.id, monthlyId), eq(monthly.spaceId, spaceId)))
    .limit(1);

  if (!result) {
    throw new MonthlyError("MONTHLY_NOT_FOUND", "Monthly was not found");
  }

  return result;
}

async function findMonthliesSection(
  db: OrbitDb,
  spaceId: string,
): Promise<typeof section.$inferSelect> {
  const [result] = await db
    .select()
    .from(section)
    .where(
      and(
        eq(section.spaceId, spaceId),
        eq(section.kind, "monthlies"),
        eq(section.isSystem, true),
      ),
    )
    .limit(1);

  if (!result) {
    throw new MonthlyError(
      "MONTHLIES_SECTION_NOT_FOUND",
      "The Space has no Monthlies Section",
    );
  }

  return result;
}

async function findSpaceTimezone(
  db: OrbitDb,
  spaceId: string,
): Promise<string> {
  const [result] = await db
    .select({ timezone: space.timezone })
    .from(space)
    .where(eq(space.id, spaceId))
    .limit(1);

  if (!result) {
    throw new MonthlyError("MONTHLIES_SECTION_NOT_FOUND", "Space was not found");
  }

  return result.timezone;
}

async function validateAssignee(
  db: OrbitDb,
  spaceId: string,
  assigneeId: string | null | undefined,
): Promise<void> {
  if (assigneeId == null) return;

  const [membership] = await db
    .select({ id: spaceMember.id })
    .from(spaceMember)
    .where(
      and(
        eq(spaceMember.spaceId, spaceId),
        eq(spaceMember.userId, assigneeId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new MonthlyError(
      "INVALID_ASSIGNEE",
      "Assignee must be a Member of this Space",
    );
  }
}

function normalizeMonthlyTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) {
    throw new MonthlyError("INVALID_TITLE", "Monthly title cannot be empty");
  }
  return normalized;
}

function validateDueDay(dueDayOfMonth: number): number {
  if (!Number.isInteger(dueDayOfMonth) || dueDayOfMonth < 1 || dueDayOfMonth > 31) {
    throw new MonthlyError(
      "INVALID_DUE_DAY",
      "Monthly due day must be an integer from 1 through 31",
    );
  }
  return dueDayOfMonth;
}

type CalendarDate = { year: number; month: number; day: number };

function nextDueOnForDueDay(
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

function advanceNextDueOn(nextDueOn: string, dueDayOfMonth: number): string {
  const current = parseCalendarDate(nextDueOn);
  const { year, month } = nextMonth(current.year, current.month);
  return formatCalendarDate({
    year,
    month,
    day: Math.min(dueDayOfMonth, daysInMonth(year, month)),
  });
}

function calendarDateInTimeZone(now: Date, timezone: string): CalendarDate {
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

function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new MonthlyError("MONTHLY_NOT_FOUND", "Monthly due date is invalid");
  }
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

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatCalendarDate(date: CalendarDate): string {
  return [date.year, date.month, date.day]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, "0")))
    .join("-");
}
