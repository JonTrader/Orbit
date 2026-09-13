"use server";

import { z } from "zod";

import type { monthly } from "@/lib/db/schema";
import {
  deleteMonthly as deleteMonthlyService,
  updateMonthly as updateMonthlyService,
} from "@/lib/services/monthlies";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const dueDayOfMonthSchema = z
  .number()
  .int("Monthly due day must be an integer")
  .min(1, "Monthly due day must be between 1 and 31")
  .max(31, "Monthly due day must be between 1 and 31");

const updateMonthlyInputSchema = z
  .object({
    spaceId: z.uuid(),
    monthlyId: z.uuid(),
    title: z.string().trim().min(1, "Monthly title cannot be empty").optional(),
    body: z.string().optional(),
    dueDayOfMonth: dueDayOfMonthSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.body !== undefined ||
      input.dueDayOfMonth !== undefined,
    "Monthly update must include a title, description, or due day",
  );

const deleteMonthlyInputSchema = z
  .object({
    spaceId: z.uuid(),
    monthlyId: z.uuid(),
  })
  .strict();

export type UpdateMonthlyInput = z.input<typeof updateMonthlyInputSchema>;
export type UpdateMonthlyResult = ActionResult<typeof monthly.$inferSelect>;
export type DeleteMonthlyInput = z.input<typeof deleteMonthlyInputSchema>;
export type DeleteMonthlyResult = ActionResult<typeof monthly.$inferSelect>;

/**
 * Updates a Monthly's title, optional description, or due day. Read-only
 * Members cannot edit Monthlies; the owning domain service enforces that
 * via requireMembership.
 */
export const updateMonthly = defineAction(
  updateMonthlyInputSchema,
  async (parsed, { userId, db }) =>
    updateMonthlyService(db, {
      userId,
      spaceId: parsed.spaceId,
      monthlyId: parsed.monthlyId,
      title: parsed.title,
      body: parsed.body,
      dueDayOfMonth: parsed.dueDayOfMonth,
    }),
);

/**
 * Permanently deletes a Monthly from the Monthlies Section. Read-only
 * Members cannot delete Monthlies; the owning domain service enforces
 * that via requireMembership.
 */
export const deleteMonthly = defineAction(
  deleteMonthlyInputSchema,
  async (parsed, { userId, db }) =>
    deleteMonthlyService(db, {
      userId,
      spaceId: parsed.spaceId,
      monthlyId: parsed.monthlyId,
    }),
);
