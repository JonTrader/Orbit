import { z } from "zod";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";

export const sectionIdParamsSchema = spaceIdParamsSchema.extend({
  sectionId: z.uuid(),
});

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
