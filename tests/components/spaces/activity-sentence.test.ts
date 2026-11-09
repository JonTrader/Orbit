import { describe, expect, it } from "vitest";

import {
  formatActivitySentence,
  formatActivityTimestamp,
} from "@/components/spaces/activity-sentence";
import type { ActivityEntry } from "@/lib/services/activity";
import type { SpaceMemberPreview } from "@/lib/spaces/viewer";

const bob: SpaceMemberPreview = {
  userId: "user_bob",
  name: "Bob",
  role: "editor",
};

function entry(
  overrides: Partial<ActivityEntry> & Pick<ActivityEntry, "action">,
): ActivityEntry {
  const { details, ...rest } = overrides;
  return {
    id: "00000000-0000-4000-8000-000000000001",
    spaceId: "00000000-0000-4000-8000-000000000002",
    actorUserId: "user_ada",
    actorName: "Ada",
    entityType: "task",
    entityId: "00000000-0000-4000-8000-000000000003",
    period: null,
    createdAt: "2026-09-01T15:00:00.000000Z",
    details: { title: "Rent", ...details },
    ...rest,
  };
}

describe("formatActivitySentence", () => {
  it("formats create, update, reopen, and delete", () => {
    expect(formatActivitySentence(entry({ action: "created" }))).toBe(
      "Ada created Rent",
    );
    expect(
      formatActivitySentence(
        entry({
          action: "updated",
          details: {
            title: "Rent",
            changes: {
              title: { from: "Old", to: "Rent" },
              assigneeId: { from: null, to: "user_bob", toName: "Bob" },
            },
          },
        }),
      ),
    ).toBe("Ada updated Rent");
    expect(formatActivitySentence(entry({ action: "reopened" }))).toBe(
      "Ada reopened Rent",
    );
    expect(
      formatActivitySentence(
        entry({
          action: "deleted",
          entityType: "note",
          details: {
            title: "List",
            cause: "section_deleted",
            sectionName: "Kitchen",
          },
        }),
      ),
    ).toBe("Ada deleted List");
  });

  it("formats assignment from the snapshot, then Members, then Former Member", () => {
    expect(
      formatActivitySentence(
        entry({
          action: "assigned",
          details: {
            title: "Rent",
            changes: {
              assigneeId: { from: null, to: "user_bob", toName: "Robert" },
            },
          },
        }),
        [bob],
      ),
    ).toBe("Ada assigned Rent to Robert");

    expect(
      formatActivitySentence(
        entry({
          action: "assigned",
          details: {
            title: "Rent",
            changes: { assigneeId: { from: null, to: "user_bob" } },
          },
        }),
        [bob],
      ),
    ).toBe("Ada assigned Rent to Bob");

    expect(
      formatActivitySentence(
        entry({
          action: "assigned",
          details: {
            title: "Rent",
            changes: { assigneeId: { from: "user_gone", to: "user_gone" } },
          },
        }),
        [bob],
      ),
    ).toBe("Ada assigned Rent to Former Member");
  });

  it("formats clearing an Assignee", () => {
    expect(
      formatActivitySentence(
        entry({
          action: "assigned",
          details: {
            title: "Rent",
            changes: {
              assigneeId: { from: "user_bob", to: null, fromName: "Bob" },
            },
          },
        }),
      ),
    ).toBe("Ada cleared the Assignee on Rent");
  });

  it("uses the Monthly period only for Monthly completion", () => {
    expect(
      formatActivitySentence(
        entry({
          action: "completed",
          entityType: "monthly",
          period: "2026-09-01",
        }),
      ),
    ).toBe("Ada completed Rent for Sep 1");

    expect(
      formatActivitySentence(
        entry({
          action: "completed",
          entityType: "task",
          period: "2026-09-01",
        }),
      ),
    ).toBe("Ada completed Rent");

    expect(
      formatActivitySentence(
        entry({
          action: "completed",
          entityType: "monthly",
          period: null,
        }),
      ),
    ).toBe("Ada completed Rent");
  });

  it("formats a move and a missing actor", () => {
    expect(
      formatActivitySentence(
        entry({
          action: "moved",
          details: { title: "Rent", toSectionName: "Daily" },
        }),
      ),
    ).toBe("Ada moved Rent to Daily");

    expect(
      formatActivitySentence(
        entry({
          action: "moved",
          details: { title: "Rent" },
        }),
      ),
    ).toBe("Ada moved Rent to another Section");

    expect(
      formatActivitySentence(
        entry({ action: "created", actorUserId: null, actorName: null }),
      ),
    ).toBe("Former Member created Rent");

    expect(
      formatActivitySentence(entry({ action: "created", actorName: "  " })),
    ).toBe("Former Member created Rent");
  });
});

describe("formatActivityTimestamp", () => {
  it("formats a short absolute time in the Space timezone", () => {
    expect(
      formatActivityTimestamp("2026-09-01T15:00:00.000Z", "America/New_York"),
    ).toBe("Sep 1, 11:00 AM");
    expect(formatActivityTimestamp("2026-09-01T15:00:00.000Z", "UTC")).toBe(
      "Sep 1, 3:00 PM",
    );
  });

  it("falls back when the instant or timezone cannot be formatted", () => {
    expect(formatActivityTimestamp("not-a-date", "UTC")).toBe("not-a-date");
    expect(
      formatActivityTimestamp("2026-09-01T15:00:00.000Z", "Not/AZone"),
    ).toBe("Sep 1, 3:00 PM");
  });
});
