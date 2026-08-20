import { z } from "zod";

import { spaceIdParamsSchema } from "@/app/api/v1/schema";

export const taskIdParamsSchema = spaceIdParamsSchema.extend({
  taskId: z.uuid(),
});

export const listTasksQuerySchema = z
  .object({
    sectionId: z.uuid().optional(),
  })
  .strict();

export const createTaskBodySchema = z
  .object({
    sectionId: z.uuid(),
    title: z.string().trim().min(1, "Task title cannot be empty"),
    dueOn: z.iso.date().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1, "Task title cannot be empty").optional(),
    dueOn: z.iso.date().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const moveTaskBodySchema = z
  .object({
    targetSectionId: z.uuid(),
  })
  .strict();
