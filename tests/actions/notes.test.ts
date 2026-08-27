import "../setup/api-mocks";
import "../setup/action-mocks";

import { spaceLayoutPath } from "@/lib/spaces/paths";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { updateNote } from "@/lib/actions/notes";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { note, section, spaceMember } from "@/lib/db/schema";

import {
  authenticateAs,
  getRevalidatePathMock,
  getRequireVerifiedSessionMock,
} from "../setup/action-mocks";
import { setTestDatabase } from "../setup/api-mocks";
import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SeededNote {
  ownerId: string;
  editorId: string;
  readOnlyId: string;
  outsiderId: string;
  spaceId: string;
  noteId: string;
}

async function seedNote(): Promise<SeededNote> {
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

  const [notesSection] = await testDb
    .insert(section)
    .values({
      spaceId: seeded.space.id,
      name: "Ideas",
      kind: "notes",
      sortOrder: 2,
    })
    .returning();

  const [created] = await testDb
    .insert(note)
    .values({
      spaceId: seeded.space.id,
      sectionId: notesSection.id,
      sectionKind: "notes",
      title: "Original title",
      body: "Original body",
      createdBy: owner.id,
    })
    .returning();

  return {
    ownerId: owner.id,
    editorId: editor.id,
    readOnlyId: readOnly.id,
    outsiderId: outsider.id,
    spaceId: seeded.space.id,
    noteId: created.id,
  };
}

describe("updateNote action", () => {
  beforeAll(async () => {
    setTestDatabase(testDb);
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    getRequireVerifiedSessionMock().mockReset();
    getRevalidatePathMock().mockReset();
  });

  it("updates a Note's title and body and revalidates the Space layout", async () => {
    const s = await seedNote();
    authenticateAs(s.ownerId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
      title: "  Renamed  ",
      body: "New body",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Renamed");
    expect(result.data.body).toBe("New body");

    const [row] = await testDb.select().from(note);
    expect(row.title).toBe("Renamed");
    expect(row.body).toBe("New body");
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
    expect(getRevalidatePathMock()).toHaveBeenCalledWith(
      spaceLayoutPath(s.spaceId),
      "layout",
    );
  });

  it("updates the body alone, leaving the title untouched", async () => {
    const s = await seedNote();
    authenticateAs(s.editorId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
      body: "Body only",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the update to succeed");
    expect(result.data.title).toBe("Original title");
    expect(result.data.body).toBe("Body only");
    expect(getRevalidatePathMock()).toHaveBeenCalledTimes(1);
  });

  it("rejects a whitespace-only title as a validation error", async () => {
    const s = await seedNote();
    authenticateAs(s.ownerId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
      title: "   ",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.issues?.[0]?.path).toEqual(["title"]);
    }
    const [row] = await testDb.select().from(note);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects an update with neither title nor body", async () => {
    const s = await seedNote();
    authenticateAs(s.ownerId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("rejects unknown note ids with NOTE_NOT_FOUND", async () => {
    const s = await seedNote();
    authenticateAs(s.ownerId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: crypto.randomUUID(),
      title: "Ghost",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOTE_NOT_FOUND");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks read-only Members from editing Notes", async () => {
    const s = await seedNote();
    authenticateAs(s.readOnlyId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
      title: "Read-only attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INSUFFICIENT_ROLE");
    }
    const [row] = await testDb.select().from(note);
    expect(row.title).toBe("Original title");
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });

  it("blocks users who are not Members of the Space", async () => {
    const s = await seedNote();
    authenticateAs(s.outsiderId);

    const result = await updateNote({
      spaceId: s.spaceId,
      noteId: s.noteId,
      title: "Outsider attempt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_MEMBER");
    }
    expect(getRevalidatePathMock()).not.toHaveBeenCalled();
  });
});
