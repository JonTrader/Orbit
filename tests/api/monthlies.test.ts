import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: undefined as unknown,
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    getDb: () => mocks.database,
  };
});

import {
  GET as getMonthlyRoute,
  DELETE as deleteMonthlyRoute,
  PATCH as updateMonthlyRoute,
} from "@/app/api/v1/spaces/[spaceId]/monthlies/[monthlyId]/route";
import {
  POST as completeMonthlyRoute,
} from "@/app/api/v1/spaces/[spaceId]/monthlies/[monthlyId]/complete/route";
import {
  GET as listMonthliesRoute,
  POST as createMonthlyRoute,
} from "@/app/api/v1/spaces/[spaceId]/monthlies/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

interface MonthlyBody {
  id: string;
  spaceId: string;
  sectionKind: string;
  title: string;
  dueDayOfMonth: number;
  nextDueOn: string;
  assigneeId: string | null;
  lastCompletedAt: string | null;
  lastCompletedBy: string | null;
}

function authenticateAs(userId: string, emailVerified = true): void {
  mocks.getSession.mockResolvedValue({
    user: { id: userId, emailVerified },
  });
}

function jsonRequest(
  url: string,
  body: unknown,
  method = "POST",
): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function spaceContext(spaceId: string): {
  params: Promise<{ spaceId: string }>;
} {
  return { params: Promise.resolve({ spaceId }) };
}

function monthlyContext(spaceId: string, monthlyId: string): {
  params: Promise<{ spaceId: string; monthlyId: string }>;
} {
  return { params: Promise.resolve({ spaceId, monthlyId }) };
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Monthlies API", () => {
  beforeAll(async () => {
    mocks.database = testDb;
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    mocks.getSession.mockReset();
  });

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const assignee = await createUser({ email: "assignee@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      timezone: "America/Chicago",
      ownerUserId: owner.id,
    });

    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
      { spaceId: seeded.space.id, userId: assignee.id, role: "read-only" },
    ]);

    return { owner, editor, readOnly, assignee, outsider, ...seeded };
  }

  it("rejects unauthenticated Monthly reads with the shared error envelope", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await listMonthliesRoute(
      new Request("http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/monthlies"),
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

  it("supports Monthly CRUD and completion", async () => {
    const { assignee, editor, space } = await seedSpace();
    authenticateAs(editor.id);

    const createResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "  Rent  ",
        dueDayOfMonth: 15,
        assigneeId: assignee.id,
      }),
      spaceContext(space.id),
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<MonthlyBody>(createResponse);
    expect(created).toMatchObject({
      spaceId: space.id,
      sectionKind: "monthlies",
      title: "Rent",
      dueDayOfMonth: 15,
      assigneeId: assignee.id,
      lastCompletedAt: null,
      lastCompletedBy: null,
    });
    expect(created.nextDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const listResponse = await listMonthliesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies`),
      spaceContext(space.id),
    );
    expect(listResponse.status).toBe(200);
    await expect(responseJson<MonthlyBody[]>(listResponse)).resolves.toEqual([
      expect.objectContaining({ id: created.id, title: "Rent" }),
    ]);

    const getResponse = await getMonthlyRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}`),
      monthlyContext(space.id, created.id),
    );
    expect(getResponse.status).toBe(200);
    await expect(responseJson<MonthlyBody>(getResponse)).resolves.toMatchObject({
      id: created.id,
      title: "Rent",
    });

    const updateResponse = await updateMonthlyRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/monthlies/${created.id}`,
        { title: "Mortgage", dueDayOfMonth: 31, assigneeId: null },
        "PATCH",
      ),
      monthlyContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(200);
    const updated = await responseJson<MonthlyBody>(updateResponse);
    expect(updated).toMatchObject({
      id: created.id,
      title: "Mortgage",
      dueDayOfMonth: 31,
      assigneeId: null,
    });
    expect(updated.nextDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const completeResponse = await completeMonthlyRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}/complete`,
        { method: "POST" },
      ),
      monthlyContext(space.id, created.id),
    );
    expect(completeResponse.status).toBe(200);
    const completed = await responseJson<MonthlyBody>(completeResponse);
    expect(completed).toMatchObject({
      id: created.id,
      lastCompletedBy: editor.id,
      lastCompletedAt: expect.any(String),
    });
    expect(completed.nextDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(completed.nextDueOn).not.toBe(updated.nextDueOn);

    const deleteResponse = await deleteMonthlyRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}`, {
        method: "DELETE",
      }),
      monthlyContext(space.id, created.id),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe("");

    const missingResponse = await getMonthlyRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}`),
      monthlyContext(space.id, created.id),
    );
    expect(missingResponse.status).toBe(404);
    await expect(responseJson<ErrorBody>(missingResponse)).resolves.toMatchObject({
      error: { code: "MONTHLY_NOT_FOUND" },
    });
  });

  it("accepts Better Auth style assignee IDs on create and update", async () => {
    const { editor, space } = await seedSpace();
    const betterAuthAssignee = await createUser({
      id: "ZyxWvUtSrQpOnMlKjIhGfEdCbA9876",
      email: "better-auth-assignee@orbit.test",
    });
    await testDb.insert(spaceMember).values([
      { spaceId: space.id, userId: betterAuthAssignee.id, role: "read-only" },
    ]);
    authenticateAs(editor.id);

    const createResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "Assigned to Better Auth user",
        dueDayOfMonth: 5,
        assigneeId: betterAuthAssignee.id,
      }),
      spaceContext(space.id),
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<MonthlyBody>(createResponse);
    expect(created.assigneeId).toBe(betterAuthAssignee.id);

    const updateResponse = await updateMonthlyRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/monthlies/${created.id}`,
        { assigneeId: betterAuthAssignee.id },
        "PATCH",
      ),
      monthlyContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(200);
    await expect(responseJson<MonthlyBody>(updateResponse)).resolves.toMatchObject({
      assigneeId: betterAuthAssignee.id,
    });
  });

  it("allows read-only reads but rejects Monthly mutations and non-member access", async () => {
    const { editor, outsider, readOnly, space } = await seedSpace();
    authenticateAs(editor.id);
    const createResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "Protected",
        dueDayOfMonth: 1,
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<MonthlyBody>(createResponse);

    authenticateAs(readOnly.id);
    const readResponse = await listMonthliesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    const updateResponse = await updateMonthlyRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/monthlies/${created.id}`,
        { title: "Nope" },
        "PATCH",
      ),
      monthlyContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(updateResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const completeResponse = await completeMonthlyRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}/complete`,
        { method: "POST" },
      ),
      monthlyContext(space.id, created.id),
    );
    expect(completeResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(completeResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    authenticateAs(outsider.id);
    const nonMemberResponse = await getMonthlyRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/monthlies/${created.id}`),
      monthlyContext(space.id, created.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });
  });

  it("returns boundary validation and Monthly domain errors through the API envelope", async () => {
    const { editor, outsider, space } = await seedSpace();
    authenticateAs(editor.id);

    const invalidIdResponse = await listMonthliesRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid/monthlies"),
      spaceContext("not-a-uuid"),
    );
    expect(invalidIdResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidIdResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidTitleResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "  ",
        dueDayOfMonth: 1,
      }),
      spaceContext(space.id),
    );
    expect(invalidTitleResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidTitleResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    for (const dueDayOfMonth of [0, 32, 1.5]) {
      const invalidDueDayResponse = await createMonthlyRoute(
        jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
          title: "Invalid due day",
          dueDayOfMonth,
        }),
        spaceContext(space.id),
      );
      expect(invalidDueDayResponse.status).toBe(400);
      await expect(responseJson<ErrorBody>(invalidDueDayResponse)).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }

    const invalidAssigneeResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "Cross-space assignee",
        dueDayOfMonth: 1,
        assigneeId: outsider.id,
      }),
      spaceContext(space.id),
    );
    expect(invalidAssigneeResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidAssigneeResponse)).resolves.toMatchObject({
      error: { code: "INVALID_ASSIGNEE" },
    });

    const createValidResponse = await createMonthlyRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/monthlies`, {
        title: "Needs an update",
        dueDayOfMonth: 1,
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<MonthlyBody>(createValidResponse);

    const emptyUpdateResponse = await updateMonthlyRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/monthlies/${created.id}`,
        {},
        "PATCH",
      ),
      monthlyContext(space.id, created.id),
    );
    expect(emptyUpdateResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(emptyUpdateResponse)).resolves.toMatchObject({
      error: { code: "INVALID_UPDATE" },
    });
  });
});
