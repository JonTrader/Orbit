import { z } from "zod";

export const sectionSpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const sectionIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
    sectionId: z.uuid(),
  })
  .strict();

export const createSectionBodySchema = z
  .object({
    name: z.string().trim().min(1, "Section name cannot be empty"),
    kind: z.enum(["tasks", "notes", "mixed"]),
  })
  .strict();

export const renameSectionBodySchema = z
  .object({
    name: z.string().trim().min(1, "Section name cannot be empty"),
  })
  .strict();

export const reorderSectionsBodySchema = z
  .object({
    sectionIds: z.array(z.uuid()),
  })
  .strict();
