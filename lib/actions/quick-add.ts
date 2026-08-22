"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_PATH } from "@/lib/auth-paths";
import type { monthly, note, task } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { createMonthly, MonthlyError } from "@/lib/services/monthlies";
import { createNote } from "@/lib/services/notes";
import { listSections, SectionError } from "@/lib/services/sections";
import { createTask } from "@/lib/services/tasks";
import { requireVerifiedSession } from "@/lib/session";

import { toActionError, type ActionResult } from "./result";

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
export async function quickAdd(input: unknown): Promise<QuickAddResult> {
  // Awaited outside try so its redirect for unauthenticated or unverified
  // callers propagates instead of turning into an action error.
  const session = await requireVerifiedSession();

  try {
    const parsed = quickAddInputSchema.parse(input);
    const db = getDb();
    const userId = session.user.id;

    const sections = await listSections(db, {
      userId,
      spaceId: parsed.spaceId,
    });
    // Upcoming and any unknown id reject here: they have no Section row.
    const target = sections.find((row) => row.id === parsed.sectionId);
    if (!target) {
      throw new SectionError("SECTION_NOT_FOUND", "Section was not found");
    }

    let created: QuickAddCreated;
    switch (target.kind) {
      case "monthlies": {
        if (!parsed.dueDayOfMonth) {
          throw new MonthlyError(
            "INVALID_DUE_DAY",
            "Adding a Monthly needs a due day of month",
          );
        }
        created = {
          entity: "monthly",
          monthly: await createMonthly(db, {
            userId,
            spaceId: parsed.spaceId,
            title: parsed.title,
            dueDayOfMonth: parsed.dueDayOfMonth,
          }),
        };
        break;
      }
      case "notes": {
        created = {
          entity: "note",
          note: await createNote(db, {
            userId,
            spaceId: parsed.spaceId,
            sectionId: target.id,
            title: parsed.title,
          }),
        };
        break;
      }
      default: {
        created = {
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

    revalidatePath(APP_PATH);
    return { ok: true, data: created };
  } catch (error) {
    return toActionError(error);
  }
}
