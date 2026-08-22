"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { APP_PATH } from "@/lib/auth-paths";
import type { section } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import {
  createCustomSection,
  deleteCustomSection,
  reorderCustomSections,
  // Aliased: the action below owns the name `renameSection` in this module.
  renameSection as renameSectionService,
} from "@/lib/services/sections";
import { requireVerifiedSession } from "@/lib/session";

import { toActionError, type ActionResult } from "./result";

const createSectionInputSchema = z
  .object({
    spaceId: z.uuid(),
    name: z.string().trim().min(1, "Section name cannot be empty"),
    kind: z.enum(["tasks", "notes", "mixed"]),
  })
  .strict();

const renameSectionInputSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
    name: z.string().trim().min(1, "Section name cannot be empty"),
  })
  .strict();

const reorderSectionsInputSchema = z
  .object({
    spaceId: z.uuid(),
    /** The complete custom Section order; system Sections stay at the top. */
    sectionIds: z.array(z.uuid()),
  })
  .strict();

const deleteSectionInputSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
  })
  .strict();

export type CreateSectionInput = z.input<typeof createSectionInputSchema>;
export type RenameSectionInput = z.input<typeof renameSectionInputSchema>;
export type ReorderSectionsInput = z.input<typeof reorderSectionsInputSchema>;
export type DeleteSectionInput = z.input<typeof deleteSectionInputSchema>;

type SectionRow = typeof section.$inferSelect;

/**
 * Creates a custom Section (tasks, notes, or mixed) after the existing
 * Sections. System Daily and Monthlies are fixed and cannot be recreated.
 */
export async function createSection(
  input: unknown,
): Promise<ActionResult<SectionRow>> {
  const session = await requireVerifiedSession();

  try {
    const parsed = createSectionInputSchema.parse(input);
    const created = await createCustomSection(getDb(), {
      userId: session.user.id,
      spaceId: parsed.spaceId,
      name: parsed.name,
      kind: parsed.kind,
    });

    revalidatePath(APP_PATH);
    return { ok: true, data: created };
  } catch (error) {
    return toActionError(error);
  }
}

/** Renames a custom Section. System Section names are fixed. */
export async function renameSection(
  input: unknown,
): Promise<ActionResult<SectionRow>> {
  const session = await requireVerifiedSession();

  try {
    const parsed = renameSectionInputSchema.parse(input);
    const renamed = await renameSectionService(getDb(), {
      userId: session.user.id,
      spaceId: parsed.spaceId,
      sectionId: parsed.sectionId,
      name: parsed.name,
    });

    revalidatePath(APP_PATH);
    return { ok: true, data: renamed };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Applies one complete custom Section order. System Sections cannot be
 * included and remain at the top of the navigation.
 */
export async function reorderSections(
  input: unknown,
): Promise<ActionResult<SectionRow[]>> {
  const session = await requireVerifiedSession();

  try {
    const parsed = reorderSectionsInputSchema.parse(input);
    const ordered = await reorderCustomSections(getDb(), {
      userId: session.user.id,
      spaceId: parsed.spaceId,
      sectionIds: parsed.sectionIds,
    });

    revalidatePath(APP_PATH);
    return { ok: true, data: ordered };
  } catch (error) {
    return toActionError(error);
  }
}

/** Deletes a custom Section; its content is removed by database cascade. */
export async function deleteSection(
  input: unknown,
): Promise<ActionResult<SectionRow>> {
  const session = await requireVerifiedSession();

  try {
    const parsed = deleteSectionInputSchema.parse(input);
    const deleted = await deleteCustomSection(getDb(), {
      userId: session.user.id,
      spaceId: parsed.spaceId,
      sectionId: parsed.sectionId,
    });

    revalidatePath(APP_PATH);
    return { ok: true, data: deleted };
  } catch (error) {
    return toActionError(error);
  }
}
