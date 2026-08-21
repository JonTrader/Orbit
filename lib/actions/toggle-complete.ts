"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_PATH } from "@/lib/auth-paths";
import type { monthly, task } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { completeMonthly } from "@/lib/services/monthlies";
import { completeTask, getTask, reopenTask } from "@/lib/services/tasks";
import { requireVerifiedSession } from "@/lib/session";

import { toActionError, type ActionResult } from "./result";

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
export async function toggleComplete(
  input: unknown,
): Promise<ToggleCompleteResult> {
  // Awaited outside try so its redirect for unauthenticated or unverified
  // callers propagates instead of turning into an action error.
  const session = await requireVerifiedSession();

  try {
    const parsed = toggleCompleteInputSchema.parse(input);
    const db = getDb();
    const userId = session.user.id;

    let updated: ToggleCompleteUpdated;
    switch (parsed.entity) {
      case "monthly": {
        updated = {
          entity: "monthly",
          monthly: await completeMonthly(db, {
            userId,
            spaceId: parsed.spaceId,
            monthlyId: parsed.entityId,
          }),
        };
        break;
      }
      case "task": {
        const current = await getTask(db, {
          userId,
          spaceId: parsed.spaceId,
          taskId: parsed.entityId,
        });
        updated = {
          entity: "task",
          task: current.completedAt
            ? await reopenTask(db, {
                userId,
                spaceId: parsed.spaceId,
                taskId: parsed.entityId,
              })
            : await completeTask(db, {
                userId,
                spaceId: parsed.spaceId,
                taskId: parsed.entityId,
              }),
        };
      }
    }

    revalidatePath(APP_PATH);
    return { ok: true, data: updated };
  } catch (error) {
    return toActionError(error);
  }
}
