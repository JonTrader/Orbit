"use server";

import { z } from "zod";

import type { task } from "@/lib/db/schema";
import {
  deleteTask as deleteTaskService,
  updateTask as updateTaskService,
} from "@/lib/services/tasks";

import { defineAction } from "./framework";
import type { ActionResult } from "./result";

const updateTaskInputSchema = z
  .object({
    spaceId: z.uuid(),
    taskId: z.uuid(),
    title: z.string().trim().min(1, "Task title cannot be empty").optional(),
    dueOn: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine(
    (input) => input.title !== undefined || input.dueOn !== undefined,
    "Task update must include a title or due date",
  );

const deleteTaskInputSchema = z
  .object({
    spaceId: z.uuid(),
    taskId: z.uuid(),
  })
  .strict();

export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
export type UpdateTaskResult = ActionResult<typeof task.$inferSelect>;
export type DeleteTaskInput = z.input<typeof deleteTaskInputSchema>;
export type DeleteTaskResult = ActionResult<typeof task.$inferSelect>;

/**
 * Updates a Task's title or optional due date. Read-only Members cannot
 * edit Tasks; the owning domain service enforces that via requireMembership.
 */
export const updateTask = defineAction(
  updateTaskInputSchema,
  async (parsed, { userId, db }) =>
    updateTaskService(db, {
      userId,
      spaceId: parsed.spaceId,
      taskId: parsed.taskId,
      title: parsed.title,
      dueOn: parsed.dueOn,
    }),
);

/**
 * Permanently deletes a Task from its current Section. Read-only Members
 * cannot delete Tasks; the owning domain service enforces that via
 * requireMembership.
 */
export const deleteTask = defineAction(
  deleteTaskInputSchema,
  async (parsed, { userId, db }) =>
    deleteTaskService(db, {
      userId,
      spaceId: parsed.spaceId,
      taskId: parsed.taskId,
    }),
);
