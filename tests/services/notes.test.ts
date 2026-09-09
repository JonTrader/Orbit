import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";
import { createCustomSection } from "@/lib/services/sections";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  NoteError,
  updateNote,
} from "@/lib/services/notes";

import { migrateTestDb, testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

describe("Note services", () => {
  beforeAll(migrateTestDb);
  beforeEach(truncateAll);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
    ]);
    const notesSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Ideas",
      kind: "notes",
    });
    const mixedSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Home",
      kind: "mixed",
    });
    const tasksSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: seeded.space.id,
      name: "Errands",
      kind: "tasks",
    });

    return {
      owner,
      editor,
      readOnly,
      ...seeded,
      notesSection,
      mixedSection,
      tasksSection,
    };
  }

  it("supports many Notes in notes and mixed Sections", async () => {
    const { space, editor, readOnly, notesSection, mixedSection } = await seedSpace();

    const first = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: " Paint colours ",
      body: "Warm white\nfor the hallway.",
    });
    const second = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "Measurements",
    });
    const mixed = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: mixedSection.id,
      title: "Mixed note",
      body: "<b>Stored as plain text</b>",
    });

    expect(first).toMatchObject({
      sectionId: notesSection.id,
      sectionKind: "notes",
      title: "Paint colours",
      body: "Warm white\nfor the hallway.",
    });
    expect(second.body).toBe("");
    expect(mixed).toMatchObject({
      sectionId: mixedSection.id,
      sectionKind: "mixed",
      body: "<b>Stored as plain text</b>",
    });
    await expect(
      listNotes(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionId: notesSection.id,
      }),
    ).resolves.toMatchObject([
      { id: first.id, title: "Paint colours" },
      { id: second.id, title: "Measurements" },
    ]);
    await expect(
      listNotes(testDb, { userId: readOnly.id, spaceId: space.id }),
    ).resolves.toHaveLength(3);
  });

  it("gets, updates, and deletes Notes", async () => {
    const { space, editor, notesSection } = await seedSpace();
    const created = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "Original",
      body: "First draft",
    });

    await expect(
      getNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: created.id,
      }),
    ).resolves.toMatchObject({ title: "Original", body: "First draft" });

    const updated = await updateNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
      title: "Revised",
      body: "",
    });
    expect(updated).toMatchObject({ title: "Revised", body: "" });

    await expect(
      deleteNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: created.id,
      }),
    ).resolves.toMatchObject({ id: created.id });
    await expect(
      getNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: created.id,
      }),
    ).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
  });

  it("rejects Notes in Daily, Monthlies, and task-only Sections", async () => {
    const { space, editor, sections, tasksSection } = await seedSpace();

    for (const sectionId of [sections.daily.id, sections.monthlies.id, tasksSection.id]) {
      await expect(
        createNote(testDb, {
          userId: editor.id,
          spaceId: space.id,
          sectionId,
          title: "Invalid note location",
        }),
      ).rejects.toMatchObject({ code: "INVALID_SECTION" });
    }
  });

  it("denies Note mutations to read-only Members", async () => {
    const { space, editor, readOnly, notesSection } = await seedSpace();
    const created = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "Protected",
    });

    for (const action of [
      () =>
        createNote(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          sectionId: notesSection.id,
          title: "Nope",
        }),
      () =>
        updateNote(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          noteId: created.id,
          title: "Nope",
        }),
      () =>
        deleteNote(testDb, {
          userId: readOnly.id,
          spaceId: space.id,
          noteId: created.id,
        }),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: "INSUFFICIENT_ROLE",
        status: 403,
      });
    }
  });

  it("rejects non-member reads and cross-Space Note lookups", async () => {
    const { space, editor, notesSection } = await seedSpace();
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const otherOwner = await createUser({ email: "other-owner@orbit.test" });
    const other = await createSpaceWithSystemSections(testDb, {
      name: "Other",
      ownerUserId: otherOwner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: other.space.id,
      userId: editor.id,
      role: "editor",
    });
    const otherNotes = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      name: "Other Ideas",
      kind: "notes",
    });
    const otherNote = await createNote(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      sectionId: otherNotes.id,
      title: "Other Space Note",
    });
    const homeNote = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "Home Note",
    });

    await expect(
      listNotes(testDb, { userId: outsider.id, spaceId: space.id }),
    ).rejects.toMatchObject({ code: "NOT_MEMBER" });
    await expect(
      getNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: otherNote.id,
      }),
    ).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
    await expect(
      getNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: homeNote.id,
      }),
    ).resolves.toMatchObject({ id: homeNote.id });
  });

  it("rejects empty titles and empty updates", async () => {
    const { space, editor, notesSection } = await seedSpace();

    await expect(
      createNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: notesSection.id,
        title: " ",
      }),
    ).rejects.toBeInstanceOf(NoteError);

    const created = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "No changes",
    });
    await expect(
      updateNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: created.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_UPDATE" });
  });
});
