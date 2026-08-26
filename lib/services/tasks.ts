import { and, asc, eq, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/authz/require-membership";
import type { OrbitDb } from "@/lib/db/client";
import { section, task, type SectionKind } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";
import { assertAssigneeIsMember } from "@/lib/services/assignees";

export type TaskSectionKind = "daily" | "tasks" | "mixed";
export type TaskErrorCode =
  | "INVALID_ASSIGNEE"
  | "INVALID_SECTION"
  | "INVALID_TITLE"
  | "INVALID_UPDATE"
  | "TASK_NOT_FOUND";

export class TaskError extends DomainError<TaskErrorCode> {
  readonly name = "TaskError";

  constructor(code: TaskErrorCode, message: string) {
    super(code, message);
  }
}

export interface TaskAccessInput {
  userId: string;
  spaceId: string;
}

export interface ListTasksInput extends TaskAccessInput {
  sectionId?: string;
}

export interface CreateTaskInput extends TaskAccessInput {
  sectionId: string;
  /**
   * Already-resolved target Section row. Callers that just validated the
   * Section themselves (quick-add resolves it from the Space's Section list)
   * pass it here to skip a redundant re-query; it must match `sectionId`,
   * belong to the Space, and accept Tasks, or the service re-validates.
   */
  section?: typeof section.$inferSelect;
  title: string;
  dueOn?: string | null;
  assigneeId?: string | null;
}

export interface GetTaskInput extends TaskAccessInput {
  taskId: string;
}

export interface UpdateTaskInput extends GetTaskInput {
  title?: string;
  dueOn?: string | null;
  assigneeId?: string | null;
}

export interface MoveTaskInput extends GetTaskInput {
  targetSectionId: string;
}

type TaskRow = typeof task.$inferSelect;

/** Lists Tasks in a Space, optionally limited to one Section. */
export async function listTasks(
  db: OrbitDb,
  input: ListTasksInput,
): Promise<TaskRow[]> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });

  const where = input.sectionId
    ? and(
        eq(task.spaceId, input.spaceId),
        eq(task.sectionId, input.sectionId),
      )
    : eq(task.spaceId, input.spaceId);

  return db
    .select()
    .from(task)
    .where(where)
    .orderBy(asc(task.sortOrder), asc(task.createdAt), asc(task.id));
}

/** Gets one Task after confirming Space membership. */
export async function getTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "read-only" });
  return findTask(db, input.spaceId, input.taskId);
}

/** Creates a Task in Daily or a custom tasks/mixed Section. */
export async function createTask(
  db: OrbitDb,
  input: CreateTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const title = normalizeTaskTitle(input.title);
  const resolved = input.section;
  const targetSection =
    resolved &&
    resolved.id === input.sectionId &&
    resolved.spaceId === input.spaceId &&
    isTaskSectionKind(resolved.kind)
      ? (resolved as typeof section.$inferSelect & { kind: TaskSectionKind })
      : await findTaskSection(db, input.spaceId, input.sectionId);
  await assertAssigneeIsMember(
    db,
    input.spaceId,
    input.assigneeId,
    (message) => new TaskError("INVALID_ASSIGNEE", message),
  );

  const [created] = await db
    .insert(task)
    .values({
      spaceId: input.spaceId,
      sectionId: targetSection.id,
      sectionKind: targetSection.kind,
      title,
      dueOn: input.dueOn ?? null,
      assigneeId: input.assigneeId ?? null,
      createdBy: input.userId,
    })
    .returning();

  return created;
}

/** Updates editable Task fields without changing its Section. */
export async function updateTask(
  db: OrbitDb,
  input: UpdateTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  await findTask(db, input.spaceId, input.taskId);

  const updates: Partial<typeof task.$inferInsert> = {};
  if (input.title !== undefined) updates.title = normalizeTaskTitle(input.title);
  if (input.dueOn !== undefined) updates.dueOn = input.dueOn;
  if (input.assigneeId !== undefined) {
    await assertAssigneeIsMember(
      db,
      input.spaceId,
      input.assigneeId,
      (message) => new TaskError("INVALID_ASSIGNEE", message),
    );
    updates.assigneeId = input.assigneeId;
  }

  if (Object.keys(updates).length === 0) {
    throw new TaskError("INVALID_UPDATE", "Task update has no changes");
  }

  const [updated] = await db
    .update(task)
    .set(updates)
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!updated) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return updated;
}

/** Deletes a Task from its current Section. */
export async function deleteTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const [deleted] = await db
    .delete(task)
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!deleted) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return deleted;
}

/** Completes a Task and records the Member who completed it. */
export async function completeTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const [completed] = await db
    .update(task)
    .set({ completedAt: new Date(), completedBy: input.userId })
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!completed) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return completed;
}

/** Reopens a completed Task. Nothing resets automatically at midnight. */
export async function reopenTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const [reopened] = await db
    .update(task)
    .set({ completedAt: null, completedBy: null })
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!reopened) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return reopened;
}

/** Atomically toggles a Task between completed and open. */
export async function toggleTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  const now = new Date();
  const [toggled] = await db
    .update(task)
    .set({
      completedAt: sql`CASE WHEN ${task.completedAt} IS NULL THEN ${now} ELSE NULL END::timestamptz`,
      completedBy: sql`CASE WHEN ${task.completedAt} IS NULL THEN ${input.userId} ELSE NULL END`,
    })
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!toggled) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return toggled;
}

/** Moves a Task only among Daily and custom tasks/mixed Sections. */
export async function moveTask(
  db: OrbitDb,
  input: MoveTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  await findTask(db, input.spaceId, input.taskId);
  const targetSection = await findTaskSection(
    db,
    input.spaceId,
    input.targetSectionId,
  );

  const [moved] = await db
    .update(task)
    .set({
      sectionId: targetSection.id,
      sectionKind: targetSection.kind,
    })
    .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
    .returning();

  if (!moved) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return moved;
}

async function findTask(
  db: OrbitDb,
  spaceId: string,
  taskId: string,
): Promise<TaskRow> {
  const [result] = await db
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.spaceId, spaceId)))
    .limit(1);

  if (!result) {
    throw new TaskError("TASK_NOT_FOUND", "Task was not found");
  }

  return result;
}

async function findTaskSection(
  db: OrbitDb,
  spaceId: string,
  sectionId: string,
): Promise<typeof section.$inferSelect & { kind: TaskSectionKind }> {
  const [result] = await db
    .select()
    .from(section)
    .where(and(eq(section.id, sectionId), eq(section.spaceId, spaceId)))
    .limit(1);

  if (!result || !isTaskSectionKind(result.kind)) {
    throw new TaskError(
      "INVALID_SECTION",
      "Tasks can only belong to Daily, tasks, or mixed Sections",
    );
  }

  return result as typeof section.$inferSelect & { kind: TaskSectionKind };
}

function isTaskSectionKind(kind: SectionKind): kind is TaskSectionKind {
  return kind === "daily" || kind === "tasks" || kind === "mixed";
}

function normalizeTaskTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) {
    throw new TaskError("INVALID_TITLE", "Task title cannot be empty");
  }
  return normalized;
}
