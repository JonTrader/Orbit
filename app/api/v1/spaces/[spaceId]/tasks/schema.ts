import { z } from "zod";

export const taskSpaceParamsSchema = z
  .object({
    spaceId: z.uuid(),
  })
  .strict();

export const taskIdParamsSchema = z
  .object({
    spaceId: z.uuid(),
    taskId: z.uuid(),
  })
  .strict();

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
    assigneeId: z.uuid().nullable().optional(),
  })
  .strict();

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1, "Task title cannot be empty").optional(),
    dueOn: z.iso.date().nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .strict();

export const moveTaskBodySchema = z
  .object({
    targetSectionId: z.uuid(),
  })
  .strict();
