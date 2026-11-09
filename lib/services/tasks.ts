import { and, eq, inArray, sql } from "drizzle-orm";

import { requireMembership } from "@/lib/spaces/membership";
import { fetchTasks } from "@/lib/spaces/queries/fetch-tasks";
import type { OrbitDb, OrbitExecutor } from "@/lib/db/client";
import {
  section,
  task,
  user,
  type ActivityAction,
  type SectionKind,
} from "@/lib/db/schema";
import { DomainError } from "@/lib/domain-error";
import {
  recordActivity,
  type ActivityDetails,
  type ActivityFieldChange,
} from "@/lib/services/activity";
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

export type ListTasksDueOn = "any" | "dated" | "undated";
export type ListTasksStatus = "open" | "completed" | "all";

export interface ListTasksInput extends TaskAccessInput {
  sectionId?: string;
  /** Defaults to "any": no due-date filter. */
  dueOn?: ListTasksDueOn;
  /** Defaults to "all": open and completed Tasks. */
  status?: ListTasksStatus;
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
  return fetchTasks(db, {
    spaceId: input.spaceId,
    sectionId: input.sectionId,
    dueOn: input.dueOn,
    status: input.status,
  });
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

  return db.transaction(async (tx) => {
    const [created] = await tx
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

    await recordTaskActivity(tx, input, created.id, "created", { title });
    return created;
  });
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

  return db.transaction(async (tx) => {
    const current = await findTask(tx, input.spaceId, input.taskId);
    const [updated] = await tx
      .update(task)
      .set(updates)
      .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
      .returning();

    if (!updated) {
      throw new TaskError("TASK_NOT_FOUND", "Task was not found");
    }

    const changes = await taskFieldChanges(tx, current, updates);
    if (changes) {
      const assigneeOnly =
        Object.keys(changes).length === 1 && changes.assigneeId !== undefined;
      await recordTaskActivity(
        tx,
        input,
        updated.id,
        assigneeOnly ? "assigned" : "updated",
        { title: updated.title, changes },
      );
    }

    return updated;
  });
}

/** Deletes a Task from its current Section. */
export async function deleteTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(task)
      .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
      .returning();

    if (!deleted) {
      throw new TaskError("TASK_NOT_FOUND", "Task was not found");
    }

    await recordTaskActivity(tx, input, deleted.id, "deleted", {
      title: deleted.title,
    });
    return deleted;
  });
}

/** Completes a Task and records the Member who completed it. */
export async function completeTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  return db.transaction(async (tx) => {
    const [completed] = await tx
      .update(task)
      .set({ completedAt: new Date(), completedBy: input.userId })
      .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
      .returning();

    if (!completed) {
      throw new TaskError("TASK_NOT_FOUND", "Task was not found");
    }

    await recordTaskActivity(tx, input, completed.id, "completed", {
      title: completed.title,
    });
    return completed;
  });
}

/** Reopens a completed Task. Nothing resets automatically at midnight. */
export async function reopenTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  return db.transaction(async (tx) => {
    const [reopened] = await tx
      .update(task)
      .set({ completedAt: null, completedBy: null })
      .where(and(eq(task.id, input.taskId), eq(task.spaceId, input.spaceId)))
      .returning();

    if (!reopened) {
      throw new TaskError("TASK_NOT_FOUND", "Task was not found");
    }

    await recordTaskActivity(tx, input, reopened.id, "reopened", {
      title: reopened.title,
    });
    return reopened;
  });
}

/** Atomically toggles a Task between completed and open. */
export async function toggleTask(
  db: OrbitDb,
  input: GetTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });

  return db.transaction(async (tx) => {
    const now = new Date();
    const [toggled] = await tx
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

    await recordTaskActivity(
      tx,
      input,
      toggled.id,
      toggled.completedAt !== null ? "completed" : "reopened",
      { title: toggled.title },
    );
    return toggled;
  });
}

/** Moves a Task only among Daily and custom tasks/mixed Sections. */
export async function moveTask(
  db: OrbitDb,
  input: MoveTaskInput,
): Promise<TaskRow> {
  await requireMembership(db, { ...input, minimumRole: "editor" });
  const current = await findTask(db, input.spaceId, input.taskId);
  if (input.targetSectionId === current.sectionId) {
    return current;
  }

  return db.transaction(async (tx) => {
    const latest = await findTask(tx, input.spaceId, input.taskId);
    if (latest.sectionId === input.targetSectionId) {
      return latest;
    }

    const fromSection = await findTaskSection(
      tx,
      input.spaceId,
      latest.sectionId,
    );
    const targetSection = await findTaskSection(
      tx,
      input.spaceId,
      input.targetSectionId,
    );

    const [moved] = await tx
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

    await recordTaskActivity(tx, input, moved.id, "moved", {
      title: moved.title,
      fromSectionId: fromSection.id,
      toSectionId: targetSection.id,
      fromSectionName: fromSection.name,
      toSectionName: targetSection.name,
    });
    return moved;
  });
}

async function findTask(
  db: OrbitExecutor,
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
  db: OrbitExecutor,
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

async function recordTaskActivity(
  executor: OrbitExecutor,
  input: { userId: string; spaceId: string },
  taskId: string,
  action: ActivityAction,
  details: ActivityDetails,
): Promise<void> {
  await recordActivity(executor, {
    spaceId: input.spaceId,
    actorUserId: input.userId,
    entityType: "task",
    entityId: taskId,
    action,
    details,
  });
}

/** Diff of supplied fields against the stored row. Unchanged fields are omitted. */
async function taskFieldChanges(
  executor: OrbitExecutor,
  current: TaskRow,
  supplied: Partial<Pick<TaskRow, "title" | "dueOn" | "assigneeId">>,
): Promise<Record<string, ActivityFieldChange> | undefined> {
  const changes: Record<string, ActivityFieldChange> = {};

  if (supplied.title !== undefined && supplied.title !== current.title) {
    changes.title = { from: current.title, to: supplied.title };
  }
  if (supplied.dueOn !== undefined && supplied.dueOn !== current.dueOn) {
    changes.dueOn = { from: current.dueOn, to: supplied.dueOn };
  }
  if (
    supplied.assigneeId !== undefined &&
    supplied.assigneeId !== current.assigneeId
  ) {
    changes.assigneeId = await assigneeFieldChange(
      executor,
      current.assigneeId,
      supplied.assigneeId,
    );
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

/** Snapshots Assignee names from `user`. Clearing omits `toName`. */
async function assigneeFieldChange(
  executor: OrbitExecutor,
  fromId: string | null,
  toId: string | null,
): Promise<ActivityFieldChange> {
  const ids = [fromId, toId].filter((id): id is string => id != null);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await executor
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, ids));
    for (const row of rows) names.set(row.id, row.name);
  }

  const change: ActivityFieldChange = { from: fromId, to: toId };
  const fromName = fromId == null ? undefined : names.get(fromId);
  const toName = toId == null ? undefined : names.get(toId);
  if (fromName !== undefined) change.fromName = fromName;
  if (toName !== undefined) change.toName = toName;
  return change;
}
