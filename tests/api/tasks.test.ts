import "../setup/api-mocks";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as getTaskRoute,
  DELETE as deleteTaskRoute,
  PATCH as updateTaskRoute,
} from "@/app/api/v1/spaces/[spaceId]/tasks/[taskId]/route";
import {
  POST as completeTaskRoute,
} from "@/app/api/v1/spaces/[spaceId]/tasks/[taskId]/complete/route";
import {
  POST as moveTaskRoute,
} from "@/app/api/v1/spaces/[spaceId]/tasks/[taskId]/move/route";
import {
  POST as reopenTaskRoute,
} from "@/app/api/v1/spaces/[spaceId]/tasks/[taskId]/reopen/route";
import {
  GET as listTasksRoute,
  POST as createTaskRoute,
} from "@/app/api/v1/spaces/[spaceId]/tasks/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";

import {
  apiTestLifecycle,
  authenticateAs,
  ErrorBody,
  jsonRequest,
  responseJson,
  spaceContext,
  taskContext,
  unauthenticate,
} from "../setup/api";
import { testDb } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface TaskBody {
  id: string;
  spaceId: string;
  sectionId: string;
  sectionKind: string;
  title: string;
  dueOn: string | null;
  assigneeId: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

const { beforeAll: setupBeforeAll, beforeEach: setupBeforeEach } =
  apiTestLifecycle();

describe("Tasks API", () => {
  beforeAll(setupBeforeAll);
  beforeEach(setupBeforeEach);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const assignee = await createUser({ email: "assignee@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
      { spaceId: seeded.space.id, userId: assignee.id, role: "read-only" },
    ]);

    const [customTasks, mixed, notes] = await testDb
      .insert(section)
      .values([
        {
          spaceId: seeded.space.id,
          name: "Errands",
          kind: "tasks",
          sortOrder: 2,
        },
        {
          spaceId: seeded.space.id,
          name: "Home",
          kind: "mixed",
          sortOrder: 3,
        },
        {
          spaceId: seeded.space.id,
          name: "Ideas",
          kind: "notes",
          sortOrder: 4,
        },
      ])
      .returning();

    return {
      owner,
      editor,
      readOnly,
      assignee,
      outsider,
      ...seeded,
      customTasks,
      mixed,
      notes,
    };
  }

  it("rejects unauthenticated Task reads with the shared error envelope", async () => {
    unauthenticate();

    const response = await listTasksRoute(
      new Request("http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/tasks"),
      spaceContext("00000000-0000-0000-0000-000000000000"),
    );

    expect(response.status).toBe(401);
    await expect(responseJson<ErrorBody>(response)).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required",
      },
    });
  });

  it("supports Task CRUD, completion, reopening, filtering, and moving", async () => {
    const { assignee, editor, sections, space, customTasks } = await seedSpace();
    authenticateAs(editor.id);

    const createResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "  Take out recycling  ",
        dueOn: "2026-08-12",
        assigneeId: assignee.id,
      }),
      spaceContext(space.id),
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<TaskBody>(createResponse);
    expect(created).toMatchObject({
      spaceId: space.id,
      sectionId: sections.daily.id,
      sectionKind: "daily",
      title: "Take out recycling",
      dueOn: "2026-08-12",
      assigneeId: assignee.id,
      completedAt: null,
      completedBy: null,
    });

    const listResponse = await listTasksRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/tasks?sectionId=${sections.daily.id}`,
      ),
      spaceContext(space.id),
    );
    expect(listResponse.status).toBe(200);
    await expect(responseJson<TaskBody[]>(listResponse)).resolves.toEqual([
      expect.objectContaining({ id: created.id, title: "Take out recycling" }),
    ]);

    const getResponse = await getTaskRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}`),
      taskContext(space.id, created.id),
    );
    expect(getResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(getResponse)).resolves.toMatchObject({
      id: created.id,
      title: "Take out recycling",
    });

    const updateResponse = await updateTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}`,
        { title: "Recycling", dueOn: null, assigneeId: null },
        "PATCH",
      ),
      taskContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(updateResponse)).resolves.toMatchObject({
      id: created.id,
      title: "Recycling",
      dueOn: null,
      assigneeId: null,
    });

    const completeResponse = await completeTaskRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}/complete`,
        { method: "POST" },
      ),
      taskContext(space.id, created.id),
    );
    expect(completeResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(completeResponse)).resolves.toMatchObject({
      id: created.id,
      completedBy: editor.id,
      completedAt: expect.any(String),
    });

    const reopenResponse = await reopenTaskRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}/reopen`,
        { method: "POST" },
      ),
      taskContext(space.id, created.id),
    );
    expect(reopenResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(reopenResponse)).resolves.toMatchObject({
      id: created.id,
      completedAt: null,
      completedBy: null,
    });

    const moveResponse = await moveTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}/move`,
        { targetSectionId: customTasks.id },
      ),
      taskContext(space.id, created.id),
    );
    expect(moveResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(moveResponse)).resolves.toMatchObject({
      id: created.id,
      sectionId: customTasks.id,
      sectionKind: "tasks",
    });

    const deleteResponse = await deleteTaskRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}`, {
        method: "DELETE",
      }),
      taskContext(space.id, created.id),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe("");

    const missingResponse = await getTaskRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}`),
      taskContext(space.id, created.id),
    );
    expect(missingResponse.status).toBe(404);
    await expect(responseJson<ErrorBody>(missingResponse)).resolves.toMatchObject({
      error: { code: "TASK_NOT_FOUND" },
    });
  });

  it("accepts Better Auth style assignee IDs on create and update", async () => {
    const { editor, sections, space } = await seedSpace();
    const betterAuthAssignee = await createUser({
      id: "AbCdEfGhIjKlMnOpQrStUvWxYz0123",
      email: "better-auth-assignee@orbit.test",
    });
    await testDb.insert(spaceMember).values([
      { spaceId: space.id, userId: betterAuthAssignee.id, role: "read-only" },
    ]);
    authenticateAs(editor.id);

    const createResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "Assigned to Better Auth user",
        assigneeId: betterAuthAssignee.id,
      }),
      spaceContext(space.id),
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<TaskBody>(createResponse);
    expect(created.assigneeId).toBe(betterAuthAssignee.id);

    const updateResponse = await updateTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}`,
        { assigneeId: betterAuthAssignee.id },
        "PATCH",
      ),
      taskContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(200);
    await expect(responseJson<TaskBody>(updateResponse)).resolves.toMatchObject({
      assigneeId: betterAuthAssignee.id,
    });
  });

  it("allows read-only reads but rejects Task mutations and non-member access", async () => {
    const { editor, outsider, readOnly, sections, space, customTasks } = await seedSpace();
    authenticateAs(editor.id);
    const createResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "Protected",
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<TaskBody>(createResponse);

    authenticateAs(readOnly.id);
    const readResponse = await listTasksRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/tasks`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    const updateResponse = await updateTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}`,
        { title: "Nope" },
        "PATCH",
      ),
      taskContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(updateResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const completeResponse = await completeTaskRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}/complete`,
        { method: "POST" },
      ),
      taskContext(space.id, created.id),
    );
    expect(completeResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(completeResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const moveResponse = await moveTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}/move`,
        { targetSectionId: customTasks.id },
      ),
      taskContext(space.id, created.id),
    );
    expect(moveResponse.status).toBe(403);

    authenticateAs(outsider.id);
    const nonMemberResponse = await getTaskRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/tasks/${created.id}`),
      taskContext(space.id, created.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });
  });

  it("returns boundary validation and Task domain errors through the API envelope", async () => {
    const { editor, sections, space, notes } = await seedSpace();
    authenticateAs(editor.id);

    const invalidIdResponse = await listTasksRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid/tasks"),
      spaceContext("not-a-uuid"),
    );
    expect(invalidIdResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidIdResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidQueryResponse = await listTasksRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/tasks?sectionId=not-a-uuid`,
      ),
      spaceContext(space.id),
    );
    expect(invalidQueryResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidQueryResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidTitleResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "  ",
      }),
      spaceContext(space.id),
    );
    expect(invalidTitleResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidTitleResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidDateResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "Invalid date",
        dueOn: "2026-02-30",
      }),
      spaceContext(space.id),
    );
    expect(invalidDateResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidDateResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const monthlyResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.monthlies.id,
        title: "Cannot become Monthly",
      }),
      spaceContext(space.id),
    );
    expect(monthlyResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(monthlyResponse)).resolves.toMatchObject({
      error: { code: "INVALID_SECTION" },
    });

    const createValidResponse = await createTaskRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/tasks`, {
        sectionId: sections.daily.id,
        title: "Needs an update",
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<TaskBody>(createValidResponse);

    const emptyUpdateResponse = await updateTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}`,
        {},
        "PATCH",
      ),
      taskContext(space.id, created.id),
    );
    expect(emptyUpdateResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(emptyUpdateResponse)).resolves.toMatchObject({
      error: { code: "INVALID_UPDATE" },
    });

    const invalidMoveResponse = await moveTaskRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/tasks/${created.id}/move`,
        { targetSectionId: notes.id },
      ),
      taskContext(space.id, created.id),
    );
    expect(invalidMoveResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidMoveResponse)).resolves.toMatchObject({
      error: { code: "INVALID_SECTION" },
    });
  });
});
