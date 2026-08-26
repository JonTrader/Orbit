"use server";

import { z } from "zod";

import type { monthly, task } from "@/lib/db/schema";
import { completeMonthly } from "@/lib/services/monthlies";
import { toggleTask } from "@/lib/services/tasks";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const toggleCompleteInputSchema = z
  .object({
    spaceId: z.uuid(),
    entity: z.enum(["task", "monthly"]),
    entityId: z.uuid(),
  })
  .strict();

export type ToggleCompleteInput = z.input<typeof toggleCompleteInputSchema>;

/** The mutated entity, tagged so views can update the right row in place. */
export type ToggleCompleteUpdated =
  | { entity: "task"; task: typeof task.$inferSelect }
  | { entity: "monthly"; monthly: typeof monthly.$inferSelect };

export type ToggleCompleteResult = ActionResult<ToggleCompleteUpdated>;

/**
 * Flips the done state of one agenda row. Tasks toggle: completing keeps them
 * completed until someone reopens them (no midnight reset), so the action
 * completes an open Task and reopens a completed one. Monthlies do not
 * toggle: completing finishes the current period and advances the next due
 * date, so every call completes exactly one period.
 */
export const toggleComplete = defineAction(
  toggleCompleteInputSchema,
  async (parsed, { userId, db }): Promise<ToggleCompleteUpdated> => {
    switch (parsed.entity) {
      case "monthly": {
        return {
          entity: "monthly",
          monthly: await completeMonthly(db, {
            userId,
            spaceId: parsed.spaceId,
            monthlyId: parsed.entityId,
          }),
        };
      }
      case "task": {
        return {
          entity: "task",
          task: await toggleTask(db, {
            userId,
            spaceId: parsed.spaceId,
            taskId: parsed.entityId,
          }),
        };
      }
    }
  },
);
