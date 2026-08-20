import "../setup/api-mocks";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as getNoteRoute,
  DELETE as deleteNoteRoute,
  PATCH as updateNoteRoute,
} from "@/app/api/v1/spaces/[spaceId]/notes/[noteId]/route";
import {
  GET as listNotesRoute,
  POST as createNoteRoute,
} from "@/app/api/v1/spaces/[spaceId]/notes/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { section, spaceMember } from "@/lib/db/schema";

import {
  apiTestLifecycle,
  authenticateAs,
  ErrorBody,
  jsonRequest,
  noteContext,
  responseJson,
  spaceContext,
  unauthenticate,
} from "../setup/api";
import { testDb } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface NoteBody {
  id: string;
  spaceId: string;
  sectionId: string;
  sectionKind: string;
  title: string;
  body: string;
}

const { beforeAll: setupBeforeAll, beforeEach: setupBeforeEach } =
  apiTestLifecycle();

describe("Notes API", () => {
  beforeAll(setupBeforeAll);
  beforeEach(setupBeforeEach);

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

    const [notesSection, mixedSection, tasksSection] = await testDb
      .insert(section)
      .values([
        {
          spaceId: seeded.space.id,
          name: "Ideas",
          kind: "notes",
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
          name: "Errands",
          kind: "tasks",
          sortOrder: 4,
        },
      ])
      .returning();

    return {
      owner,
      editor,
      readOnly,
      outsider,
      ...seeded,
      notesSection,
      mixedSection,
      tasksSection,
    };
  }

  it("rejects unauthenticated Note reads with the shared error envelope", async () => {
    unauthenticate();

    const response = await listNotesRoute(
      new Request("http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/notes"),
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

  it("supports many Notes, section filtering, plain text bodies, and CRUD", async () => {
    const { editor, mixedSection, notesSection, space } = await seedSpace();
    authenticateAs(editor.id);

    const firstResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "  Paint colours  ",
        body: "Warm white\n<b>for the hallway.</b>",
      }),
      spaceContext(space.id),
    );
    expect(firstResponse.status).toBe(201);
    const first = await responseJson<NoteBody>(firstResponse);
    expect(first).toMatchObject({
      spaceId: space.id,
      sectionId: notesSection.id,
      sectionKind: "notes",
      title: "Paint colours",
      body: "Warm white\n<b>for the hallway.</b>",
    });

    const secondResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "Measurements",
      }),
      spaceContext(space.id),
    );
    expect(secondResponse.status).toBe(201);
    const second = await responseJson<NoteBody>(secondResponse);
    expect(second.body).toBe("");

    const mixedResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: mixedSection.id,
        title: "Mixed note",
        body: "Plain text",
      }),
      spaceContext(space.id),
    );
    expect(mixedResponse.status).toBe(201);
    const mixed = await responseJson<NoteBody>(mixedResponse);
    expect(mixed.sectionKind).toBe("mixed");

    const filteredListResponse = await listNotesRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/notes?sectionId=${notesSection.id}`,
      ),
      spaceContext(space.id),
    );
    expect(filteredListResponse.status).toBe(200);
    await expect(responseJson<NoteBody[]>(filteredListResponse)).resolves.toEqual([
      expect.objectContaining({ id: first.id, title: "Paint colours" }),
      expect.objectContaining({ id: second.id, title: "Measurements" }),
    ]);

    const allNotesResponse = await listNotesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes`),
      spaceContext(space.id),
    );
    await expect(responseJson<NoteBody[]>(allNotesResponse)).resolves.toHaveLength(3);

    const getResponse = await getNoteRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes/${first.id}`),
      noteContext(space.id, first.id),
    );
    expect(getResponse.status).toBe(200);
    await expect(responseJson<NoteBody>(getResponse)).resolves.toMatchObject({
      id: first.id,
      body: "Warm white\n<b>for the hallway.</b>",
    });

    const updateResponse = await updateNoteRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notes/${first.id}`,
        { title: "Revised colours", body: "" },
        "PATCH",
      ),
      noteContext(space.id, first.id),
    );
    expect(updateResponse.status).toBe(200);
    await expect(responseJson<NoteBody>(updateResponse)).resolves.toMatchObject({
      id: first.id,
      title: "Revised colours",
      body: "",
    });

    const deleteResponse = await deleteNoteRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes/${first.id}`, {
        method: "DELETE",
      }),
      noteContext(space.id, first.id),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe("");

    const missingResponse = await getNoteRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes/${first.id}`),
      noteContext(space.id, first.id),
    );
    expect(missingResponse.status).toBe(404);
    await expect(responseJson<ErrorBody>(missingResponse)).resolves.toMatchObject({
      error: { code: "NOTE_NOT_FOUND" },
    });

    expect(mixed.id).not.toBe(first.id);
  });

  it("allows read-only reads but rejects Note mutations and non-member access", async () => {
    const { editor, notesSection, outsider, readOnly, space } = await seedSpace();
    authenticateAs(editor.id);
    const createResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "Protected",
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<NoteBody>(createResponse);

    authenticateAs(readOnly.id);
    const readResponse = await listNotesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    const createReadOnlyResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "Nope",
      }),
      spaceContext(space.id),
    );
    expect(createReadOnlyResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(createReadOnlyResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const updateResponse = await updateNoteRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notes/${created.id}`,
        { title: "Nope" },
        "PATCH",
      ),
      noteContext(space.id, created.id),
    );
    expect(updateResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(updateResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    const deleteReadOnlyResponse = await deleteNoteRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes/${created.id}`, {
        method: "DELETE",
      }),
      noteContext(space.id, created.id),
    );
    expect(deleteReadOnlyResponse.status).toBe(403);

    authenticateAs(outsider.id);
    const nonMemberResponse = await getNoteRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notes/${created.id}`),
      noteContext(space.id, created.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });
  });

  it("returns boundary validation and Note domain errors through the API envelope", async () => {
    const { editor, notesSection, sections, space, tasksSection } = await seedSpace();
    authenticateAs(editor.id);

    const invalidIdResponse = await listNotesRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid/notes"),
      spaceContext("not-a-uuid"),
    );
    expect(invalidIdResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidIdResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidQueryResponse = await listNotesRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/notes?sectionId=not-a-uuid`,
      ),
      spaceContext(space.id),
    );
    expect(invalidQueryResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidQueryResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidTitleResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "  ",
      }),
      spaceContext(space.id),
    );
    expect(invalidTitleResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidTitleResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    for (const sectionId of [sections.daily.id, sections.monthlies.id, tasksSection.id]) {
      const invalidSectionResponse = await createNoteRoute(
        jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
          sectionId,
          title: "Invalid location",
        }),
        spaceContext(space.id),
      );
      expect(invalidSectionResponse.status).toBe(400);
      await expect(responseJson<ErrorBody>(invalidSectionResponse)).resolves.toMatchObject({
        error: { code: "INVALID_SECTION" },
      });
    }

    const createValidResponse = await createNoteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/notes`, {
        sectionId: notesSection.id,
        title: "Needs an update",
      }),
      spaceContext(space.id),
    );
    const created = await responseJson<NoteBody>(createValidResponse);

    const invalidBodyResponse = await updateNoteRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notes/${created.id}`,
        { body: 42 },
        "PATCH",
      ),
      noteContext(space.id, created.id),
    );
    expect(invalidBodyResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidBodyResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const emptyUpdateResponse = await updateNoteRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notes/${created.id}`,
        {},
        "PATCH",
      ),
      noteContext(space.id, created.id),
    );
    expect(emptyUpdateResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(emptyUpdateResponse)).resolves.toMatchObject({
      error: { code: "INVALID_UPDATE" },
    });
  });
});
