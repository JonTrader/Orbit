import { describe, expect, it } from "vitest";

import {
  assigneeLabel,
  memberOptionLabel,
} from "@/lib/spaces/assignee-label";
import type { SpaceMemberPreview } from "@/lib/spaces/viewer";

const alice: SpaceMemberPreview = {
  userId: "user_alice",
  name: "Alice",
  role: "owner",
};
const bob: SpaceMemberPreview = {
  userId: "user_bob",
  name: "Bob",
  role: "editor",
};
const aliceEditor: SpaceMemberPreview = {
  userId: "user_alice_ed",
  name: "Alice",
  role: "editor",
};

describe("assigneeLabel", () => {
  it("returns null when unassigned", () => {
    expect(assigneeLabel(null, [alice])).toBeNull();
    expect(assigneeLabel("", [alice])).toBeNull();
  });

  it("returns the Member name when the id matches", () => {
    expect(assigneeLabel("user_alice", [alice, bob])).toBe("Alice");
  });

  it('returns "Former Member" when the id is missing', () => {
    expect(assigneeLabel("user_gone", [alice, bob])).toBe("Former Member");
  });
});

describe("memberOptionLabel", () => {
  it("returns just the name when unique", () => {
    expect(memberOptionLabel(alice, [alice, bob])).toBe("Alice");
    expect(memberOptionLabel(bob, [alice, bob])).toBe("Bob");
  });

  it("disambiguates shared names with roleLabel", () => {
    const members = [alice, aliceEditor, bob];
    expect(memberOptionLabel(alice, members)).toBe("Alice (Owner)");
    expect(memberOptionLabel(aliceEditor, members)).toBe("Alice (Editor)");
    expect(memberOptionLabel(bob, members)).toBe("Bob");
  });
});
