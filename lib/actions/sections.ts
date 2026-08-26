"use server";

import { z } from "zod";

import {
  createCustomSection,
  deleteCustomSection,
  reorderCustomSections,
  // Aliased: the action below owns the name `renameSection` in this module.
  renameSection as renameSectionService,
} from "@/lib/services/sections";

import { defineAction } from "./framework";

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

/**
 * Creates a custom Section (tasks, notes, or mixed) after the existing
 * Sections. System Daily and Monthlies are fixed and cannot be recreated.
 */
export const createSection = defineAction(
  createSectionInputSchema,
  async (parsed, { userId, db }) =>
    createCustomSection(db, {
      userId,
      spaceId: parsed.spaceId,
      name: parsed.name,
      kind: parsed.kind,
    }),
);

/** Renames a custom Section. System Section names are fixed. */
export const renameSection = defineAction(
  renameSectionInputSchema,
  async (parsed, { userId, db }) =>
    renameSectionService(db, {
      userId,
      spaceId: parsed.spaceId,
      sectionId: parsed.sectionId,
      name: parsed.name,
    }),
);

/**
 * Applies one complete custom Section order. System Sections cannot be
 * included and remain at the top of the navigation.
 */
export const reorderSections = defineAction(
  reorderSectionsInputSchema,
  async (parsed, { userId, db }) =>
    reorderCustomSections(db, {
      userId,
      spaceId: parsed.spaceId,
      sectionIds: parsed.sectionIds,
    }),
);

/** Deletes a custom Section; its content is removed by database cascade. */
export const deleteSection = defineAction(
  deleteSectionInputSchema,
  async (parsed, { userId, db }) =>
    deleteCustomSection(db, {
      userId,
      spaceId: parsed.spaceId,
      sectionId: parsed.sectionId,
    }),
);
