import { describe, expect, it } from "vitest";

import type { section, SectionKind } from "@/lib/db/schema";
import { buildSpaceNav } from "@/lib/spaces/nav";

type SectionRow = typeof section.$inferSelect;

function sectionRow(
  overrides: Partial<SectionRow> &
    Pick<SectionRow, "id" | "name" | "kind" | "isSystem">,
): SectionRow {
  return {
    spaceId: "00000000-0000-4000-8000-000000000001",
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildSpaceNav", () => {
  it("sets sectionId on custom items and omits it on system views", () => {
    const spaceId = "00000000-0000-4000-8000-0000000000aa";
    const groceriesId = "00000000-0000-4000-8000-0000000000bb";
    const ideasId = "00000000-0000-4000-8000-0000000000cc";

    const items = buildSpaceNav(spaceId, [
      sectionRow({
        id: "00000000-0000-4000-8000-0000000000d1",
        name: "Daily",
        kind: "daily",
        isSystem: true,
        sortOrder: 0,
      }),
      sectionRow({
        id: "00000000-0000-4000-8000-0000000000m1",
        name: "Monthlies",
        kind: "monthlies",
        isSystem: true,
        sortOrder: 1,
      }),
      sectionRow({
        id: groceriesId,
        name: "Groceries",
        kind: "tasks" satisfies SectionKind,
        isSystem: false,
        sortOrder: 2,
      }),
      sectionRow({
        id: ideasId,
        name: "Ideas",
        kind: "notes" satisfies SectionKind,
        isSystem: false,
        sortOrder: 3,
      }),
    ]);

    expect(items.map((item) => item.key)).toEqual([
      "upcoming",
      "daily",
      "monthlies",
      groceriesId,
      ideasId,
    ]);

    const [upcoming, daily, monthlies, groceries, ideas] = items;

    expect(upcoming).not.toHaveProperty("sectionId");
    expect(daily).not.toHaveProperty("sectionId");
    expect(monthlies).not.toHaveProperty("sectionId");
    expect(upcoming.sectionId).toBeUndefined();
    expect(daily.sectionId).toBeUndefined();
    expect(monthlies.sectionId).toBeUndefined();

    expect(groceries.sectionId).toBe(groceriesId);
    expect(ideas.sectionId).toBe(ideasId);
    expect(groceries.label).toBe("Groceries");
    expect(ideas.label).toBe("Ideas");
  });
});
