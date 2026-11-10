import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { activity, note, spaceMember } from "@/lib/db/schema";
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

  async function activityFor(entityId: string) {
    return testDb
      .select()
      .from(activity)
      .where(eq(activity.entityId, entityId));
  }

  function addedActivity<T extends { id: string }>(before: T[], after: T[]) {
    const seen = new Set(before.map((row) => row.id));
    return after.filter((row) => !seen.has(row.id));
  }

  async function activityIds(spaceId: string) {
    const rows = await testDb
      .select({ id: activity.id })
      .from(activity)
      .where(eq(activity.spaceId, spaceId));
    return rows.map((row) => row.id).sort();
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

  it("records created, updated, and deleted Note Activity and skips an identical update", async () => {
    const { space, editor, notesSection } = await seedSpace();
    const created = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "  Paint colours  ",
      body: "First draft",
    });

    const createdRows = await activityFor(created.id);
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "note",
      entityId: created.id,
      action: "created",
      period: null,
    });
    expect(createdRows[0]?.details).toEqual({ title: "Paint colours" });

    const retitled = await updateNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
      title: "Revised",
    });
    expect(retitled.title).toBe("Revised");
    const titleRows = addedActivity(createdRows, await activityFor(created.id));
    expect(titleRows).toHaveLength(1);
    expect(titleRows[0]).toMatchObject({
      action: "updated",
      actorUserId: editor.id,
    });
    expect(titleRows[0]?.details).toEqual({
      title: "Revised",
      changes: { title: { from: "Paint colours", to: "Revised" } },
    });

    const beforeBody = await activityFor(created.id);
    await updateNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
      body: "Second draft",
    });
    const bodyRows = addedActivity(beforeBody, await activityFor(created.id));
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]).toMatchObject({ action: "updated", actorUserId: editor.id });
    expect(bodyRows[0]?.details).toEqual({
      title: "Revised",
      changes: { body: { from: "First draft", to: "Second draft" } },
    });

    const beforeSame = await activityFor(created.id);
    await updateNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
      title: "Revised",
      body: "Second draft",
    });
    await updateNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
      title: "  Revised  ",
    });
    expect(await activityFor(created.id)).toEqual(beforeSame);

    const deleted = await deleteNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      noteId: created.id,
    });
    expect(deleted.id).toBe(created.id);
    expect(await testDb.select().from(note).where(eq(note.id, created.id))).toEqual(
      [],
    );

    const rows = await activityFor(created.id);
    expect(rows.map((row) => row.action).sort()).toEqual([
      "created",
      "deleted",
      "updated",
      "updated",
    ]);
    expect(rows.find((row) => row.action === "deleted")).toMatchObject({
      spaceId: space.id,
      actorUserId: editor.id,
      entityType: "note",
      entityId: created.id,
      action: "deleted",
      details: { title: "Revised" },
    });
  });

  it("records nothing when a read-only Member mutates Notes", async () => {
    const { space, editor, readOnly, notesSection, sections } = await seedSpace();
    const created = await createNote(testDb, {
      userId: editor.id,
      spaceId: space.id,
      sectionId: notesSection.id,
      title: "Protected",
    });
    const before = await activityIds(space.id);

    await expect(
      createNote(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        sectionId: notesSection.id,
        title: "Nope",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      updateNote(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        noteId: created.id,
        title: "Nope",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      deleteNote(testDb, {
        userId: readOnly.id,
        spaceId: space.id,
        noteId: created.id,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await expect(
      createNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        sectionId: sections.daily.id,
        title: "Wrong section",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SECTION" });

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
    const otherSection = await createCustomSection(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      name: "Other ideas",
      kind: "notes",
    });
    const otherNote = await createNote(testDb, {
      userId: editor.id,
      spaceId: other.space.id,
      sectionId: otherSection.id,
      title: "Elsewhere",
    });
    const otherBefore = await activityFor(otherNote.id);

    await expect(
      updateNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: otherNote.id,
        title: "Hijack",
      }),
    ).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });
    await expect(
      deleteNote(testDb, {
        userId: editor.id,
        spaceId: space.id,
        noteId: otherNote.id,
      }),
    ).rejects.toMatchObject({ code: "NOTE_NOT_FOUND" });

    expect(await activityIds(space.id)).toEqual(before);
    expect(await activityFor(otherNote.id)).toEqual(otherBefore);
    expect(otherBefore.map((row) => row.action)).toEqual(["created"]);
    expect(otherBefore[0]?.spaceId).toBe(other.space.id);
  });
});
