import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { invite } from "@/lib/db/schema";
import type { MinimumMembershipRole } from "@/lib/spaces/membership";
import { hashInviteToken } from "@/lib/invites/token";

const membershipMocks = vi.hoisted(() => ({
  requireMembership: vi.fn(),
}));

vi.mock("@/lib/spaces/membership", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/spaces/membership")>();
  return {
    ...actual,
    requireMembership: (...args: Parameters<typeof actual.requireMembership>) =>
      membershipMocks.requireMembership(...args),
  };
});

vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));

import { assertAssigneeIsMember } from "@/lib/services/assignees";
import {
  acceptInvite,
  cancelInvite,
  inviteMember,
  leaveSpace,
  listMembers,
  listPendingInvites,
  previewInviteByToken,
  removeMember,
  resendInvite,
  transferOwnership,
  updateMemberRole,
} from "@/lib/services/members";
import {
  completeMonthly,
  createMonthly,
  deleteMonthly,
  getMonthly,
  listMonthlies,
  updateMonthly,
} from "@/lib/services/monthlies";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from "@/lib/services/notes";
import {
  findPreference,
  getNotificationPreference,
  updateNotificationPreference,
} from "@/lib/services/notification-preferences";
import {
  scanReminderCandidates,
  sendReminder,
  sendReminderCandidates,
} from "@/lib/services/notifications";
import {
  createCustomSection,
  deleteCustomSection,
  getSectionForMember,
  listSections,
  renameSection,
  reorderCustomSections,
} from "@/lib/services/sections";
import {
  createSpace,
  deleteSpace,
  getSpace,
  listSpaceDirectoryEntries,
  listSpaces,
  renameSpace,
  updateSpaceTimezone,
} from "@/lib/services/spaces";
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  moveTask,
  reopenTask,
  toggleTask,
  updateTask,
} from "@/lib/services/tasks";

import { testDb, truncateAll } from "../setup/db";
import { createUser } from "../setup/fixtures";

type AuthzProbe = Error & {
  name: "AuthzProbe";
  minimumRole: MinimumMembershipRole;
};

function authzProbe(minimumRole: MinimumMembershipRole): AuthzProbe {
  return Object.assign(new Error("AUTHZ_PROBE"), {
    name: "AuthzProbe" as const,
    minimumRole,
  });
}

function installAuthzProbe(): void {
  membershipMocks.requireMembership.mockImplementation(
    async (_db, input: { minimumRole?: MinimumMembershipRole }) => {
      throw authzProbe(input.minimumRole ?? "read-only");
    },
  );
}

async function expectMinimumRole(
  invoke: () => Promise<unknown>,
  minimumRole: MinimumMembershipRole,
): Promise<void> {
  installAuthzProbe();
  membershipMocks.requireMembership.mockClear();

  await expect(invoke()).rejects.toMatchObject({
    name: "AuthzProbe",
    minimumRole,
  });
  expect(membershipMocks.requireMembership).toHaveBeenCalledTimes(1);
}

type GatedEntrypoint = {
  name: string;
  minimumRole: MinimumMembershipRole;
  invoke: () => Promise<unknown>;
};

/** Mutating entrypoints that must gate via requireMembership. */
const MEMBERSHIP_GATED_MUTATIONS: GatedEntrypoint[] = [
  // Content + custom Sections: Editor
  {
    name: "createTask",
    minimumRole: "editor",
    invoke: () =>
      createTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionId: randomUUID(),
        title: "Task",
      }),
  },
  {
    name: "updateTask",
    minimumRole: "editor",
    invoke: () =>
      updateTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
        title: "Task",
      }),
  },
  {
    name: "deleteTask",
    minimumRole: "editor",
    invoke: () =>
      deleteTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
      }),
  },
  {
    name: "completeTask",
    minimumRole: "editor",
    invoke: () =>
      completeTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
      }),
  },
  {
    name: "reopenTask",
    minimumRole: "editor",
    invoke: () =>
      reopenTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
      }),
  },
  {
    name: "toggleTask",
    minimumRole: "editor",
    invoke: () =>
      toggleTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
      }),
  },
  {
    name: "moveTask",
    minimumRole: "editor",
    invoke: () =>
      moveTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
        targetSectionId: randomUUID(),
      }),
  },
  {
    name: "createNote",
    minimumRole: "editor",
    invoke: () =>
      createNote(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionId: randomUUID(),
        title: "Note",
      }),
  },
  {
    name: "updateNote",
    minimumRole: "editor",
    invoke: () =>
      updateNote(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        noteId: randomUUID(),
        title: "Note",
      }),
  },
  {
    name: "deleteNote",
    minimumRole: "editor",
    invoke: () =>
      deleteNote(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        noteId: randomUUID(),
      }),
  },
  {
    name: "createMonthly",
    minimumRole: "editor",
    invoke: () =>
      createMonthly(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        title: "Monthly",
        dueDayOfMonth: 1,
      }),
  },
  {
    name: "updateMonthly",
    minimumRole: "editor",
    invoke: () =>
      updateMonthly(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        monthlyId: randomUUID(),
        title: "Monthly",
      }),
  },
  {
    name: "deleteMonthly",
    minimumRole: "editor",
    invoke: () =>
      deleteMonthly(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        monthlyId: randomUUID(),
      }),
  },
  {
    name: "completeMonthly",
    minimumRole: "editor",
    invoke: () =>
      completeMonthly(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        monthlyId: randomUUID(),
      }),
  },
  {
    name: "createCustomSection",
    minimumRole: "editor",
    invoke: () =>
      createCustomSection(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        name: "Errands",
        kind: "tasks",
      }),
  },
  {
    name: "renameSection",
    minimumRole: "editor",
    invoke: () =>
      renameSection(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionId: randomUUID(),
        name: "Renamed",
      }),
  },
  {
    name: "reorderCustomSections",
    minimumRole: "editor",
    invoke: () =>
      reorderCustomSections(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionIds: [randomUUID()],
      }),
  },
  {
    name: "deleteCustomSection",
    minimumRole: "editor",
    invoke: () =>
      deleteCustomSection(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionId: randomUUID(),
      }),
  },

  // Space / Member / Invite administration: Owner
  {
    name: "updateSpaceTimezone",
    minimumRole: "owner",
    invoke: () =>
      updateSpaceTimezone(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        timezone: "UTC",
      }),
  },
  {
    name: "renameSpace",
    minimumRole: "owner",
    invoke: () =>
      renameSpace(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        name: "Renamed",
      }),
  },
  {
    name: "deleteSpace",
    minimumRole: "owner",
    invoke: () =>
      deleteSpace(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
      }),
  },
  {
    name: "inviteMember",
    minimumRole: "owner",
    invoke: () =>
      inviteMember(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        email: "invitee@orbit.test",
      }),
  },
  {
    name: "updateMemberRole",
    minimumRole: "owner",
    invoke: () =>
      updateMemberRole(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        targetUserId: "user-2",
        role: "editor",
      }),
  },
  {
    name: "removeMember",
    minimumRole: "owner",
    invoke: () =>
      removeMember(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        targetUserId: "user-2",
      }),
  },
  {
    name: "transferOwnership",
    minimumRole: "owner",
    invoke: () =>
      transferOwnership(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        targetUserId: "user-2",
      }),
  },

  // Documented read-only self-service mutations
  {
    name: "leaveSpace",
    minimumRole: "read-only",
    invoke: () =>
      leaveSpace(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
      }),
  },
  {
    name: "updateNotificationPreference",
    minimumRole: "read-only",
    invoke: () =>
      updateNotificationPreference(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        emailEnabled: false,
      }),
  },
];

/** Membership-gated reads: same requireMembership probe, not editor-actor 403s. */
const MEMBERSHIP_GATED_READS: GatedEntrypoint[] = [
  {
    name: "listTasks",
    minimumRole: "read-only",
    invoke: () =>
      listTasks(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "getTask",
    minimumRole: "read-only",
    invoke: () =>
      getTask(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        taskId: randomUUID(),
      }),
  },
  {
    name: "listNotes",
    minimumRole: "read-only",
    invoke: () =>
      listNotes(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "getNote",
    minimumRole: "read-only",
    invoke: () =>
      getNote(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        noteId: randomUUID(),
      }),
  },
  {
    name: "listMonthlies",
    minimumRole: "read-only",
    invoke: () =>
      listMonthlies(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "getMonthly",
    minimumRole: "read-only",
    invoke: () =>
      getMonthly(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        monthlyId: randomUUID(),
      }),
  },
  {
    name: "listSections",
    minimumRole: "read-only",
    invoke: () =>
      listSections(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "getSectionForMember",
    minimumRole: "read-only",
    invoke: () =>
      getSectionForMember(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
        sectionId: randomUUID(),
      }),
  },
  {
    name: "getSpace",
    minimumRole: "read-only",
    invoke: () =>
      getSpace(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "listMembers",
    minimumRole: "read-only",
    invoke: () =>
      listMembers(testDb, { userId: "user-1", spaceId: randomUUID() }),
  },
  {
    name: "getNotificationPreference",
    minimumRole: "read-only",
    invoke: () =>
      getNotificationPreference(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
      }),
  },
  {
    name: "listPendingInvites",
    minimumRole: "owner",
    invoke: () =>
      listPendingInvites(testDb, {
        userId: "user-1",
        spaceId: randomUUID(),
      }),
  },
];

const MEMBERSHIP_GATED = [
  ...MEMBERSHIP_GATED_MUTATIONS,
  ...MEMBERSHIP_GATED_READS,
];

/** Token / directory / job / helper entrypoints: no requireMembership. */
const UNGATED = [
  "acceptInvite",
  "createSpace",
  "listSpaces",
  "listSpaceDirectoryEntries",
  "previewInviteByToken",
  "scanReminderCandidates",
  "sendReminder",
  "sendReminderCandidates",
  "assertAssigneeIsMember",
  "findPreference",
] as const;

const SERVICES_DIR = join(process.cwd(), "lib", "services");

function exportedAsyncFunctionNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /export async function (\w+)/g;
  for (const match of source.matchAll(pattern)) {
    names.push(match[1]!);
  }
  return names;
}

describe("authorization contract", () => {
  // Completeness net for requireMembership min-role. Editor-actor 403s live
  // in domain tests (members.test.ts), not in this mocked gate.
  beforeEach(() => {
    membershipMocks.requireMembership.mockReset();
    installAuthzProbe();
  });

  it.each(MEMBERSHIP_GATED)(
    "$name requires minimumRole $minimumRole",
    async ({ invoke, minimumRole }) => {
      await expectMinimumRole(invoke, minimumRole);
    },
  );

  it("resendInvite requires owner after resolving the Invite Space", async () => {
    await truncateAll();
    const owner = await createUser({ email: "owner@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const [pending] = await testDb
      .insert(invite)
      .values({
        spaceId: space.id,
        email: "pending@orbit.test",
        role: "read-only",
        tokenDigest: hashInviteToken("contract-resend-token"),
        invitedBy: owner.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      })
      .returning();

    await expectMinimumRole(
      () =>
        resendInvite(testDb, {
          userId: owner.id,
          inviteId: pending!.id,
        }),
      "owner",
    );
  });

  it("cancelInvite requires owner after resolving the Invite Space", async () => {
    await truncateAll();
    const owner = await createUser({ email: "owner@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    const [pending] = await testDb
      .insert(invite)
      .values({
        spaceId: space.id,
        email: "pending@orbit.test",
        role: "read-only",
        tokenDigest: hashInviteToken("contract-cancel-token"),
        invitedBy: owner.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      })
      .returning();

    await expectMinimumRole(
      () =>
        cancelInvite(testDb, {
          userId: owner.id,
          inviteId: pending!.id,
        }),
      "owner",
    );
  });

  it("ungated entrypoints do not call requireMembership", async () => {
    await truncateAll();
    const owner = await createUser({ email: "owner@orbit.test" });

    membershipMocks.requireMembership.mockClear();

    const space = await createSpace(testDb, {
      userId: owner.id,
      name: "Fresh",
    });
    await expect(
      acceptInvite(testDb, { userId: owner.id, token: "missing-token" }),
    ).rejects.toMatchObject({ code: "INVITE_NOT_FOUND" });
    await listSpaces(testDb, owner.id);
    await listSpaceDirectoryEntries(testDb, owner.id);
    await previewInviteByToken(testDb, "not-a-real-token");
    await scanReminderCandidates(testDb, {});
    await sendReminderCandidates(testDb, { now: new Date() });
    await sendReminder(testDb, {
      candidate: {
        spaceId: space.id,
        kind: "daily_nudge",
        entityId: randomUUID(),
        period: "2026-01-01",
        recipientUserId: owner.id,
        recipientEmail: owner.email,
        title: "Task",
        dueOn: "2026-01-01",
      },
    });
    await assertAssigneeIsMember(
      testDb,
      space.id,
      null,
      (message) => new Error(message),
    );
    await findPreference(testDb, space.id, owner.id);

    expect(membershipMocks.requireMembership).not.toHaveBeenCalled();
  });

  it("classifies every exported async service entrypoint", () => {
    const classified = new Set<string>([
      ...MEMBERSHIP_GATED.map((entry) => entry.name),
      "resendInvite",
      "cancelInvite",
      ...UNGATED,
    ]);

    const unclassified: string[] = [];
    for (const file of readdirSync(SERVICES_DIR).filter((name) =>
      name.endsWith(".ts"),
    )) {
      const source = readFileSync(join(SERVICES_DIR, file), "utf8");
      for (const name of exportedAsyncFunctionNames(source)) {
        if (!classified.has(name)) {
          unclassified.push(`${file}:${name}`);
        }
      }
    }

    expect(unclassified).toEqual([]);
  });
});
