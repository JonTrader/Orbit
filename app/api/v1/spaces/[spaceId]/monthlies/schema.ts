import { z } from "zod";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";

export const monthlyIdParamsSchema = spaceIdParamsSchema.extend({
  monthlyId: z.uuid(),
});

const dueDayOfMonthSchema = z
  .number()
  .int("Monthly due day must be an integer")
  .min(1, "Monthly due day must be between 1 and 31")
  .max(31, "Monthly due day must be between 1 and 31");

export const createMonthlyBodySchema = z
  .object({
    title: z.string().trim().min(1, "Monthly title cannot be empty"),
    dueDayOfMonth: dueDayOfMonthSchema,
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const updateMonthlyBodySchema = z
  .object({
    title: z.string().trim().min(1, "Monthly title cannot be empty").optional(),
    dueDayOfMonth: dueDayOfMonthSchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .strict();
