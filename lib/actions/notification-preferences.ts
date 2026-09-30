"use server";

import { z } from "zod";

import {
  getNotificationPreference as getNotificationPreferenceService,
  updateNotificationPreference as updateNotificationPreferenceService,
} from "@/lib/services/notification-preferences";

import { defineAction } from "./framework";

const getNotificationPreferenceSchema = z
  .object({ spaceId: z.uuid() })
  .strict();

const updateNotificationPreferenceSchema = z
  .object({
    spaceId: z.uuid(),
    daysBefore: z
      .number()
      .int("Reminder days before must be an integer")
      .min(0, "Reminder days before must be between 0 and 30")
      .max(30, "Reminder days before must be between 0 and 30")
      .optional(),
    emailEnabled: z.boolean().optional(),
  })
  .strict();

export type GetNotificationPreferenceInput = z.input<
  typeof getNotificationPreferenceSchema
>;
export type UpdateNotificationPreferenceInput = z.input<
  typeof updateNotificationPreferenceSchema
>;

/** Loads the caller's preference and skips revalidation so opening a dialog does not refresh the Active Space. */
export const getNotificationPreference = defineAction(
  getNotificationPreferenceSchema,
  async (parsed, { userId, db }) =>
    getNotificationPreferenceService(db, {
      userId,
      spaceId: parsed.spaceId,
    }),
  { revalidate: false },
);

/** Saves the caller's preference. Allowed for every Member, including read-only, because the service enforces that. */
export const updateNotificationPreference = defineAction(
  updateNotificationPreferenceSchema,
  async (parsed, { userId, db }) =>
    updateNotificationPreferenceService(db, {
      userId,
      spaceId: parsed.spaceId,
      daysBefore: parsed.daysBefore,
      emailEnabled: parsed.emailEnabled,
    }),
);
