import { z } from "zod";

export const updateNotificationPreferenceBodySchema = z
  .object({
    daysBefore: z
      .number()
      .int("Reminder days before must be an integer")
      .min(0, "Reminder days before must be between 0 and 30")
      .max(30, "Reminder days before must be between 0 and 30")
      .optional(),
    emailEnabled: z.boolean().optional(),
  })
  .strict();
