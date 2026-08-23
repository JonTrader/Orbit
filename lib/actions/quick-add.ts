"use server";

import { z } from "zod";

import type { monthly, note, task } from "@/lib/db/schema";
import { createMonthly, MonthlyError } from "@/lib/services/monthlies";
import { createNote } from "@/lib/services/notes";
import { listSections, SectionError } from "@/lib/services/sections";
import { createTask } from "@/lib/services/tasks";

import { defineAction } from "./define-action";
import type { ActionResult } from "./result";

const quickAddInputSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
    title: z.string().trim().min(1, "Title cannot be empty"),
    dueDayOfMonth: z
      .number()
      .int("Monthly due day must be an integer")
      .min(1, "Monthly due day must be between 1 and 31")
      .max(31, "Monthly due day must be between 1 and 31")
      .optional(),
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
 * Tasks for Daily and custom tasks/mixed Sections, Notes for notes Sections,
 * Monthlies (which need a due day) for the Monthlies Section. Upcoming is a
 * view, not a Section, so it can never be a quick-add target.
 */
export const quickAdd = defineAction(
  quickAddInputSchema,
  async (parsed, { userId, db }): Promise<QuickAddCreated> => {
    const sections = await listSections(db, {
      userId,
      spaceId: parsed.spaceId,
    });
    // Upcoming and any unknown id reject here: they have no Section row.
    const target = sections.find((row) => row.id === parsed.sectionId);
    if (!target) {
      throw new SectionError("SECTION_NOT_FOUND", "Section was not found");
    }

    switch (target.kind) {
      case "monthlies": {
        if (!parsed.dueDayOfMonth) {
          throw new MonthlyError(
            "INVALID_DUE_DAY",
            "Adding a Monthly needs a due day of month",
          );
        }
        return {
          entity: "monthly",
          monthly: await createMonthly(db, {
            userId,
            spaceId: parsed.spaceId,
            title: parsed.title,
            dueDayOfMonth: parsed.dueDayOfMonth,
          }),
        };
      }
      case "notes": {
        return {
          entity: "note",
          note: await createNote(db, {
            userId,
            spaceId: parsed.spaceId,
            sectionId: target.id,
            title: parsed.title,
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
            title: parsed.title,
          }),
        };
      }
    }
  },
);
