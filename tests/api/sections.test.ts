import { eq } from "drizzle-orm";
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
  DELETE as deleteSectionRoute,
  PATCH as renameSectionRoute,
} from "@/app/api/v1/spaces/[spaceId]/sections/[sectionId]/route";
import {
  POST as reorderSectionsRoute,
} from "@/app/api/v1/spaces/[spaceId]/sections/reorder/route";
import {
  GET as listSectionsRoute,
  POST as createSectionRoute,
} from "@/app/api/v1/spaces/[spaceId]/sections/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

interface SectionBody {
  id: string;
  name: string;
  kind: string;
  isSystem: boolean;
  sortOrder: number;
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

function sectionContext(spaceId: string, sectionId: string): {
  params: Promise<{ spaceId: string; sectionId: string }>;
} {
  return { params: Promise.resolve({ spaceId, sectionId }) };
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Sections API", () => {
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
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
    ]);

    return { owner, editor, readOnly, outsider, ...seeded };
  }

  it("rejects unauthenticated Section reads with the shared error envelope", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await listSectionsRoute(
      new Request("http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/sections"),
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

  it("supports Section listing, custom CRUD, and custom reordering", async () => {
    const { editor, space, sections } = await seedSpace();
    authenticateAs(editor.id);

    const initialResponse = await listSectionsRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/sections`),
      spaceContext(space.id),
    );
    expect(initialResponse.status).toBe(200);
    await expect(responseJson<SectionBody[]>(initialResponse)).resolves.toEqual([
      expect.objectContaining({ id: sections.daily.id, kind: "daily", isSystem: true }),
      expect.objectContaining({ id: sections.monthlies.id, kind: "monthlies", isSystem: true }),
    ]);

    const firstResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "  Errands  ",
        kind: "tasks",
      }),
      spaceContext(space.id),
    );
    expect(firstResponse.status).toBe(201);
    const first = await responseJson<SectionBody>(firstResponse);
    expect(first).toMatchObject({
      name: "Errands",
      kind: "tasks",
      isSystem: false,
      sortOrder: 2,
    });

    const secondResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Ideas",
        kind: "notes",
      }),
      spaceContext(space.id),
    );
    const second = await responseJson<SectionBody>(secondResponse);

    const thirdResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Kitchen",
        kind: "mixed",
      }),
      spaceContext(space.id),
    );
    const third = await responseJson<SectionBody>(thirdResponse);

    const renameResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/${first.id}`,
        { name: "  Chores  " },
        "PATCH",
      ),
      sectionContext(space.id, first.id),
    );
    expect(renameResponse.status).toBe(200);
    await expect(responseJson<SectionBody>(renameResponse)).resolves.toMatchObject({
      id: first.id,
      name: "Chores",
    });

    const reorderResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [third.id, first.id, second.id] },
      ),
      spaceContext(space.id),
    );
    expect(reorderResponse.status).toBe(200);
    const reordered = await responseJson<SectionBody[]>(reorderResponse);
    expect(reordered.map((row) => row.id)).toEqual([
      sections.daily.id,
      sections.monthlies.id,
      third.id,
      first.id,
      second.id,
    ]);

    const deleteResponse = await deleteSectionRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/sections/${second.id}`,
        { method: "DELETE" },
      ),
      sectionContext(space.id, second.id),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe("");

    const remaining = await testDb
      .select()
      .from(section)
      .where(eq(section.spaceId, space.id));
    expect(remaining.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        sections.daily.id,
        sections.monthlies.id,
        first.id,
        third.id,
      ]),
    );
    expect(remaining.some((row) => row.id === second.id)).toBe(false);
  });

  it("allows read-only reads but rejects mutations and non-member access", async () => {
    const { editor, outsider, readOnly, space } = await seedSpace();
    const custom = await (async () => {
      authenticateAs(editor.id);
      const response = await createSectionRoute(
        jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
          name: "Errands",
          kind: "tasks",
        }),
        spaceContext(space.id),
      );
      return responseJson<SectionBody>(response);
    })();

    authenticateAs(readOnly.id);
    const readResponse = await listSectionsRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/sections`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    const createResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Nope",
        kind: "tasks",
      }),
      spaceContext(space.id),
    );
    expect(createResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(createResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const renameResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/${custom.id}`,
        { name: "Nope" },
        "PATCH",
      ),
      sectionContext(space.id, custom.id),
    );
    expect(renameResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(renameResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const reorderResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [custom.id] },
      ),
      spaceContext(space.id),
    );
    expect(reorderResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(reorderResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const deleteResponse = await deleteSectionRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/sections/${custom.id}`,
        { method: "DELETE" },
      ),
      sectionContext(space.id, custom.id),
    );
    expect(deleteResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(deleteResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    authenticateAs(outsider.id);
    const nonMemberResponse = await listSectionsRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/sections`),
      spaceContext(space.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });

    const nonMemberMutationResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/${custom.id}`,
        { name: "Nope" },
        "PATCH",
      ),
      sectionContext(space.id, custom.id),
    );
    expect(nonMemberMutationResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberMutationResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });
  });

  it("returns boundary validation and service errors through the API envelope", async () => {
    const { editor, sections, space } = await seedSpace();
    authenticateAs(editor.id);

    const invalidIdResponse = await listSectionsRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid/sections"),
      spaceContext("not-a-uuid"),
    );
    expect(invalidIdResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidIdResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidKindResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Not Daily",
        kind: "daily",
      }),
      spaceContext(space.id),
    );
    expect(invalidKindResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidKindResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const emptyNameResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "   ",
        kind: "mixed",
      }),
      spaceContext(space.id),
    );
    expect(emptyNameResponse.status).toBe(400);

    const unknownFieldResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Extra",
        kind: "tasks",
        extra: true,
      }),
      spaceContext(space.id),
    );
    expect(unknownFieldResponse.status).toBe(400);

    const invalidNameResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/${sections.daily.id}`,
        {},
        "PATCH",
      ),
      sectionContext(space.id, sections.daily.id),
    );
    expect(invalidNameResponse.status).toBe(400);

    const invalidSectionIdResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/not-a-uuid`,
        { name: "Renamed" },
        "PATCH",
      ),
      sectionContext(space.id, "not-a-uuid"),
    );
    expect(invalidSectionIdResponse.status).toBe(400);

    const missingSectionResponse = await renameSectionRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/00000000-0000-0000-0000-000000000000`,
        { name: "Ghost" },
        "PATCH",
      ),
      sectionContext(space.id, "00000000-0000-0000-0000-000000000000"),
    );
    expect(missingSectionResponse.status).toBe(404);
    await expect(responseJson<ErrorBody>(missingSectionResponse)).resolves.toMatchObject({
      error: { code: "SECTION_NOT_FOUND" },
    });

    const invalidReorderResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: ["not-a-uuid"] },
      ),
      spaceContext(space.id),
    );
    expect(invalidReorderResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidReorderResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const systemReorderResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [sections.daily.id] },
      ),
      spaceContext(space.id),
    );
    expect(systemReorderResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(systemReorderResponse)).resolves.toMatchObject({
      error: { code: "SYSTEM_SECTION" },
    });

    const systemMutationResponse = await deleteSectionRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/sections/${sections.daily.id}`,
        { method: "DELETE" },
      ),
      sectionContext(space.id, sections.daily.id),
    );
    expect(systemMutationResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(systemMutationResponse)).resolves.toMatchObject({
      error: { code: "SYSTEM_SECTION" },
    });
  });

  it("rejects reorder IDs that belong to another Space", async () => {
    const { editor, space } = await seedSpace();
    const foreignOwner = await createUser({ email: "foreign-owner@orbit.test" });
    const { space: foreignSpace } = await createSpaceWithSystemSections(testDb, {
      name: "Foreign Space",
      ownerUserId: foreignOwner.id,
    });

    authenticateAs(foreignOwner.id);
    const foreignSectionResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${foreignSpace.id}/sections`, {
        name: "Foreign Tasks",
        kind: "tasks",
      }),
      spaceContext(foreignSpace.id),
    );
    expect(foreignSectionResponse.status).toBe(201);
    const foreignSection = await responseJson<SectionBody>(foreignSectionResponse);

    authenticateAs(editor.id);
    const response = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [foreignSection.id] },
      ),
      spaceContext(space.id),
    );

    expect(response.status).toBe(409);
    await expect(responseJson<ErrorBody>(response)).resolves.toMatchObject({
      error: { code: "INVALID_REORDER" },
    });
  });

  it("enforces complete custom reorder lists", async () => {
    const { editor, space } = await seedSpace();
    authenticateAs(editor.id);

    const firstResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "First",
        kind: "tasks",
      }),
      spaceContext(space.id),
    );
    const first = await responseJson<SectionBody>(firstResponse);

    const secondResponse = await createSectionRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/sections`, {
        name: "Second",
        kind: "notes",
      }),
      spaceContext(space.id),
    );
    const second = await responseJson<SectionBody>(secondResponse);

    const partialResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [first.id] },
      ),
      spaceContext(space.id),
    );
    expect(partialResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(partialResponse)).resolves.toMatchObject({
      error: { code: "INVALID_REORDER" },
    });

    const duplicateResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [first.id, first.id] },
      ),
      spaceContext(space.id),
    );
    expect(duplicateResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(duplicateResponse)).resolves.toMatchObject({
      error: { code: "INVALID_REORDER" },
    });

    const validResponse = await reorderSectionsRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/sections/reorder`,
        { sectionIds: [second.id, first.id] },
      ),
      spaceContext(space.id),
    );
    expect(validResponse.status).toBe(200);
  });
});
