"use server";

import { z } from "zod";

import type { monthly, note, task } from "@/lib/db/schema";
import { createMonthly } from "@/lib/services/monthlies";
import { createNote } from "@/lib/services/notes";
import { getSectionForMember } from "@/lib/services/sections";
import { createTask } from "@/lib/services/tasks";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const quickAddInputSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
    title: z.string().trim().min(1, "Title cannot be empty"),
    /** Optional body for Notes; Tasks and Monthlies ignore it. */
    body: z.string().optional(),
    dueDayOfMonth: z
      .number()
      .int("Monthly due day must be an integer")
      .min(1, "Monthly due day must be between 1 and 31")
      .max(31, "Monthly due day must be between 1 and 31")
      .optional(),
    /**
     * For mixed Sections only: explicitly create a Note instead of the
     * default Task. Ignored for other Section kinds.
     */
    asNote: z.boolean().optional(),
  })
  .strict();

export type QuickAddInput = z.input<typeof quickAddInputSchema>;

/** The entity quick-add created, tagged so views can update in place. */
export type QuickAddCreated =
  | { entity: "task"; task: typeof task.$inferSelect }
  | { entity: "monthly"; monthly: typeof monthly.$inferSelect }
  | { entity: "note"; note: typeof note.$inferSelect };

export type QuickAddResult = ActionResult<QuickAddCreated>;

/**
 * Adds one item to the selected Section of the Active Space from the compose
 * bar. Dispatches to the owning domain service by resolved Section kind:
 * Tasks for Daily and custom tasks/mixed Sections (default), Notes for notes
 * Sections and for mixed Sections when `asNote` is true, Monthlies (which
 * need a due day) for the Monthlies Section. Upcoming is a view, not a
 * Section, so it can never be a quick-add target.
 */
export const quickAdd = defineAction(
  quickAddInputSchema,
  async (parsed, { userId, db }): Promise<QuickAddCreated> => {
    const target = await getSectionForMember(db, {
      userId,
      spaceId: parsed.spaceId,
      sectionId: parsed.sectionId,
    });

    switch (target.kind) {
      case "monthlies": {
        return {
          entity: "monthly",
          monthly: await createMonthly(db, {
            userId,
            spaceId: parsed.spaceId,
            title: parsed.title,
            dueDayOfMonth: parsed.dueDayOfMonth!,
          }),
        };
      }
      case "notes":
      case "mixed": {
        if (target.kind === "mixed" && !parsed.asNote) {
          return {
            entity: "task",
            task: await createTask(db, {
              userId,
              spaceId: parsed.spaceId,
              sectionId: target.id,
              // The switch already validated the kind; skip createTask's re-query.
              section: target,
              title: parsed.title,
            }),
          };
        }
        return {
          entity: "note",
          note: await createNote(db, {
            userId,
            spaceId: parsed.spaceId,
            sectionId: target.id,
            // The switch already validated the kind; skip createNote's re-query.
            section: target,
            title: parsed.title,
            body: parsed.body,
          }),
        };
      }
      default: {
        return {
          entity: "task",
          task: await createTask(db, {
            userId,
            spaceId: parsed.spaceId,
            sectionId: target.id,
            // The switch already validated the kind; skip createTask's re-query.
            section: target,
            title: parsed.title,
          }),
        };
      }
    }
  },
);
