import { z } from "zod";

export const monthlySpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const monthlyIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
    monthlyId: z.uuid(),
  })
  .strict();

const dueDayOfMonthSchema = z
  .number()
  .int("Monthly due day must be an integer")
  .min(1, "Monthly due day must be between 1 and 31")
  .max(31, "Monthly due day must be between 1 and 31");

export const createMonthlyBodySchema = z
  .object({
    title: z.string().trim().min(1, "Monthly title cannot be empty"),
    dueDayOfMonth: dueDayOfMonthSchema,
    assigneeId: z.uuid().nullable().optional(),
  })
  .strict();

export const updateMonthlyBodySchema = z
  .object({
    title: z.string().trim().min(1, "Monthly title cannot be empty").optional(),
    dueDayOfMonth: dueDayOfMonthSchema.optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .strict();
