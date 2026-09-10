import "../setup/api-mocks";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  POST as acceptInviteRoute,
} from "@/app/api/v1/invites/accept/route";
import {
  POST as resendInviteRoute,
} from "@/app/api/v1/invites/[inviteId]/resend/route";
import {
  GET as listMembersRoute,
} from "@/app/api/v1/spaces/[spaceId]/members/route";
import {
  POST as leaveSpaceRoute,
} from "@/app/api/v1/spaces/[spaceId]/members/leave/route";
import {
  DELETE as removeMemberRoute,
  PATCH as updateMemberRoleRoute,
} from "@/app/api/v1/spaces/[spaceId]/members/[userId]/route";
import {
  POST as transferOwnershipRoute,
} from "@/app/api/v1/spaces/[spaceId]/members/[userId]/transfer/route";
import {
  GET as listPendingInvitesRoute,
  POST as createInviteRoute,
} from "@/app/api/v1/spaces/[spaceId]/invites/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { invite, spaceMember } from "@/lib/db/schema";

import {
  apiTestLifecycle,
  authenticateAs,
  ErrorBody,
  inviteContext,
  jsonRequest,
  memberContext,
  responseJson,
  spaceContext,
  unauthenticate,
} from "../setup/api";
import { getSendEmailMock } from "../setup/api-mocks";
import { lastEmailedInviteToken } from "../setup/invite-email";
import { testDb } from "../setup/db";
import { createUser } from "../setup/fixtures";

process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

interface InviteBody {
  id: string;
  spaceId: string;
  email: string;
  role: string;
  token?: string;
  tokenDigest?: string;
  expiresAt: string;
  acceptedAt: string | null;
}

interface MemberBody {
  id: string;
  spaceId: string;
  userId: string;
  role: string;
  name?: string;
  email?: string;
}

const { beforeAll: setupBeforeAll, beforeEach: setupBeforeEach } =
  apiTestLifecycle();

describe("Members and Invites API", () => {
  beforeAll(setupBeforeAll);
  beforeEach(setupBeforeEach);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const editor = await createUser({ email: "editor@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const recipient = await createUser({ email: "partner@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });

    await testDb.insert(spaceMember).values([
      { spaceId: seeded.space.id, userId: editor.id, role: "editor" },
      { spaceId: seeded.space.id, userId: readOnly.id, role: "read-only" },
    ]);

    return { owner, editor, readOnly, recipient, outsider, ...seeded };
  }

  it("rejects unauthenticated Member reads with the shared error envelope", async () => {
    unauthenticate();

    const response = await listMembersRoute(
      new Request("http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/members"),
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

  it("supports Member listing, Invite creation, resend, acceptance, role updates, and removal", async () => {
    const { editor, owner, recipient, readOnly, space } = await seedSpace();
    authenticateAs(owner.id);

    const initialMembersResponse = await listMembersRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members`),
      spaceContext(space.id),
    );
    expect(initialMembersResponse.status).toBe(200);
    await expect(responseJson<MemberBody[]>(initialMembersResponse)).resolves.toHaveLength(3);

    const inviteResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: " Partner@Orbit.Test ",
        role: "editor",
      }),
      spaceContext(space.id),
    );
    expect(inviteResponse.status).toBe(201);
    const createdInvite = await responseJson<InviteBody>(inviteResponse);
    expect(createdInvite).toMatchObject({
      spaceId: space.id,
      email: "partner@orbit.test",
      role: "editor",
      acceptedAt: null,
    });
    expect(createdInvite.expiresAt).toEqual(expect.any(String));
    expect(createdInvite).not.toHaveProperty("token");
    expect(createdInvite).not.toHaveProperty("tokenDigest");
    const inviteToken = lastEmailedInviteToken(getSendEmailMock());

    const beforeResend = createdInvite.expiresAt;
    const resendResponse = await resendInviteRoute(
      new Request(
        `http://localhost/api/v1/invites/${createdInvite.id}/resend`,
        { method: "POST" },
      ),
      inviteContext(createdInvite.id),
    );
    expect(resendResponse.status).toBe(200);
    const resentInvite = await responseJson<InviteBody>(resendResponse);
    expect(new Date(resentInvite.expiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeResend).getTime(),
    );
    expect(resentInvite).not.toHaveProperty("token");
    expect(resentInvite).not.toHaveProperty("tokenDigest");
    const rotatedToken = lastEmailedInviteToken(getSendEmailMock());
    expect(rotatedToken).not.toBe(inviteToken);

    authenticateAs(recipient.id);
    const acceptResponse = await acceptInviteRoute(
      jsonRequest("/api/v1/invites/accept", { token: rotatedToken }),
    );
    expect(acceptResponse.status).toBe(201);
    await expect(responseJson<MemberBody>(acceptResponse)).resolves.toMatchObject({
      spaceId: space.id,
      userId: recipient.id,
      role: "editor",
    });

    authenticateAs(owner.id);
    const roleResponse = await updateMemberRoleRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/members/${recipient.id}`,
        { role: "read-only" },
        "PATCH",
      ),
      memberContext(space.id, recipient.id),
    );
    expect(roleResponse.status).toBe(200);
    await expect(responseJson<MemberBody>(roleResponse)).resolves.toMatchObject({
      userId: recipient.id,
      role: "read-only",
    });

    const removeResponse = await removeMemberRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members/${readOnly.id}`, {
        method: "DELETE",
      }),
      memberContext(space.id, readOnly.id),
    );
    expect(removeResponse.status).toBe(204);
    expect(await removeResponse.text()).toBe("");

    const finalMembersResponse = await listMembersRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members`),
      spaceContext(space.id),
    );
    const finalMembers = await responseJson<MemberBody[]>(finalMembersResponse);
    expect(finalMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: owner.id, role: "owner" }),
        expect.objectContaining({ userId: editor.id, role: "editor" }),
        expect.objectContaining({ userId: recipient.id, role: "read-only" }),
      ]),
    );
    expect(finalMembers.some((member) => member.userId === readOnly.id)).toBe(false);
  });

  it("lists pending Invites for Owners, scoped to the Space", async () => {
    const { editor, owner, readOnly, space } = await seedSpace();
    const otherSpace = await createSpaceWithSystemSections(testDb, {
      name: "Other Space",
      ownerUserId: owner.id,
    });
    authenticateAs(owner.id);

    const homePendingResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "pending@orbit.test",
      }),
      spaceContext(space.id),
    );
    expect(homePendingResponse.status).toBe(201);
    const homePending = await responseJson<InviteBody>(homePendingResponse);

    const homeAcceptedResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "accepted@orbit.test",
      }),
      spaceContext(space.id),
    );
    expect(homeAcceptedResponse.status).toBe(201);
    const homeAccepted = await responseJson<InviteBody>(homeAcceptedResponse);
    await testDb
      .update(invite)
      .set({ acceptedAt: new Date() })
      .where(eq(invite.id, homeAccepted.id));

    await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${otherSpace.space.id}/invites`, {
        email: "other@orbit.test",
      }),
      spaceContext(otherSpace.space.id),
    );

    const listResponse = await listPendingInvitesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/invites`),
      spaceContext(space.id),
    );
    expect(listResponse.status).toBe(200);
    const pending = await responseJson<InviteBody[]>(listResponse);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: homePending.id,
      spaceId: space.id,
      email: "pending@orbit.test",
      acceptedAt: null,
    });
    expect(pending[0]).not.toHaveProperty("token");
    expect(pending[0]).not.toHaveProperty("tokenDigest");
    expect(homePending).not.toHaveProperty("token");
    expect(homePending).not.toHaveProperty("tokenDigest");

    authenticateAs(editor.id);
    const editorListResponse = await listPendingInvitesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/invites`),
      spaceContext(space.id),
    );
    expect(editorListResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(editorListResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });

    authenticateAs(readOnly.id);
    const readOnlyListResponse = await listPendingInvitesRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/invites`),
      spaceContext(space.id),
    );
    expect(readOnlyListResponse.status).toBe(403);
  });

  it("supports ownership transfer and leaving a Space", async () => {
    const { editor, owner, space } = await seedSpace();
    await createSpaceWithSystemSections(testDb, {
      name: "Other Space",
      ownerUserId: owner.id,
    });
    authenticateAs(owner.id);

    const transferResponse = await transferOwnershipRoute(
      new Request(
        `http://localhost/api/v1/spaces/${space.id}/members/${editor.id}/transfer`,
        { method: "POST" },
      ),
      memberContext(space.id, editor.id),
    );
    expect(transferResponse.status).toBe(200);
    const transfer = await responseJson<{
      formerOwner: MemberBody;
      owner: MemberBody;
    }>(transferResponse);
    expect(transfer.formerOwner).toMatchObject({ userId: owner.id, role: "editor" });
    expect(transfer.owner).toMatchObject({ userId: editor.id, role: "owner" });

    authenticateAs(owner.id);
    const leaveResponse = await leaveSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members/leave`, {
        method: "POST",
      }),
      spaceContext(space.id),
    );
    expect(leaveResponse.status).toBe(204);
    expect(await leaveResponse.text()).toBe("");

    authenticateAs(editor.id);
    const remainingMembersResponse = await listMembersRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members`),
      spaceContext(space.id),
    );
    const remainingMembers = await responseJson<MemberBody[]>(remainingMembersResponse);
    expect(remainingMembers.some((member) => member.userId === owner.id)).toBe(false);
    expect(remainingMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: editor.id, role: "owner" }),
      ]),
    );
  });

  it("allows Member reads but rejects non-Owner operations and non-member access", async () => {
    const { editor, outsider, owner, readOnly, space } = await seedSpace();
    authenticateAs(readOnly.id);

    const readResponse = await listMembersRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    authenticateAs(owner.id);
    const pendingInviteResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "pending-for-resend@orbit.test",
      }),
      spaceContext(space.id),
    );
    expect(pendingInviteResponse.status).toBe(201);
    const pendingInvite = await responseJson<InviteBody>(pendingInviteResponse);

    authenticateAs(editor.id);
    const editorDenied = [
      createInviteRoute(
        jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
          email: "new@orbit.test",
        }),
        spaceContext(space.id),
      ),
      resendInviteRoute(
        new Request(
          `http://localhost/api/v1/invites/${pendingInvite.id}/resend`,
          { method: "POST" },
        ),
        inviteContext(pendingInvite.id),
      ),
      updateMemberRoleRoute(
        jsonRequest(
          `/api/v1/spaces/${space.id}/members/${readOnly.id}`,
          { role: "editor" },
          "PATCH",
        ),
        memberContext(space.id, readOnly.id),
      ),
      removeMemberRoute(
        new Request(
          `http://localhost/api/v1/spaces/${space.id}/members/${readOnly.id}`,
          { method: "DELETE" },
        ),
        memberContext(space.id, readOnly.id),
      ),
      transferOwnershipRoute(
        new Request(
          `http://localhost/api/v1/spaces/${space.id}/members/${readOnly.id}/transfer`,
          { method: "POST" },
        ),
        memberContext(space.id, readOnly.id),
      ),
    ];

    for (const responsePromise of editorDenied) {
      const response = await responsePromise;
      expect(response.status).toBe(403);
      await expect(responseJson<ErrorBody>(response)).resolves.toMatchObject({
        error: { code: "INSUFFICIENT_ROLE" },
      });
    }

    authenticateAs(outsider.id);
    const nonMemberResponse = await listMembersRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members`),
      spaceContext(space.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });
  });

  it("returns boundary validation and Invite errors through the API envelope", async () => {
    const { owner, space } = await seedSpace();
    authenticateAs(owner.id);

    const invalidSpaceResponse = await listMembersRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid/members"),
      spaceContext("not-a-uuid"),
    );
    expect(invalidSpaceResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidSpaceResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidEmailResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "not-an-email",
      }),
      spaceContext(space.id),
    );
    expect(invalidEmailResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidEmailResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidRoleResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "new@orbit.test",
        role: "owner",
      }),
      spaceContext(space.id),
    );
    expect(invalidRoleResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidRoleResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidInviteIdResponse = await resendInviteRoute(
      new Request("http://localhost/api/v1/invites/not-a-uuid/resend", {
        method: "POST",
      }),
      inviteContext("not-a-uuid"),
    );
    expect(invalidInviteIdResponse.status).toBe(400);

    const invalidTokenResponse = await acceptInviteRoute(
      jsonRequest("/api/v1/invites/accept", { token: " " }),
    );
    expect(invalidTokenResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidTokenResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns 409 when creating a duplicate pending Invite", async () => {
    const { owner, space } = await seedSpace();
    authenticateAs(owner.id);

    const firstResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "pending@orbit.test",
      }),
      spaceContext(space.id),
    );
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: "Pending@Orbit.Test",
      }),
      spaceContext(space.id),
    );
    expect(duplicateResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(duplicateResponse)).resolves.toMatchObject({
      error: {
        code: "INVITE_ALREADY_PENDING",
        message: "An Invite is already pending for that email in this Space",
      },
    });
  });

  it("maps Invite and leave domain errors through the API envelope", async () => {
    const { editor, owner, outsider, recipient, space } = await seedSpace();
    await createSpaceWithSystemSections(testDb, {
      name: "Other Space",
      ownerUserId: owner.id,
    });
    authenticateAs(owner.id);

    const alreadyMemberResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: editor.email,
      }),
      spaceContext(space.id),
    );
    expect(alreadyMemberResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(alreadyMemberResponse)).resolves.toMatchObject({
      error: { code: "ALREADY_MEMBER" },
    });

    const inviteResponse = await createInviteRoute(
      jsonRequest(`/api/v1/spaces/${space.id}/invites`, {
        email: recipient.email,
      }),
      spaceContext(space.id),
    );
    expect(inviteResponse.status).toBe(201);
    const pendingInvite = await responseJson<InviteBody>(inviteResponse);
    expect(pendingInvite).not.toHaveProperty("token");
    expect(pendingInvite).not.toHaveProperty("tokenDigest");
    const pendingToken = lastEmailedInviteToken(getSendEmailMock());

    await testDb
      .update(invite)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(invite.id, pendingInvite.id));

    authenticateAs(recipient.id);
    const expiredResponse = await acceptInviteRoute(
      jsonRequest("/api/v1/invites/accept", { token: pendingToken }),
    );
    expect(expiredResponse.status).toBe(410);
    await expect(responseJson<ErrorBody>(expiredResponse)).resolves.toMatchObject({
      error: { code: "EXPIRED_INVITE" },
    });

    authenticateAs(owner.id);
    const resentResponse = await resendInviteRoute(
      new Request(
        `http://localhost/api/v1/invites/${pendingInvite.id}/resend`,
        { method: "POST" },
      ),
      inviteContext(pendingInvite.id),
    );
    expect(resentResponse.status).toBe(200);
    const resentInvite = await responseJson<InviteBody>(resentResponse);
    expect(resentInvite).not.toHaveProperty("token");
    expect(resentInvite).not.toHaveProperty("tokenDigest");
    const rotatedToken = lastEmailedInviteToken(getSendEmailMock());

    authenticateAs(outsider.id);
    const mismatchResponse = await acceptInviteRoute(
      jsonRequest("/api/v1/invites/accept", { token: rotatedToken }),
    );
    expect(mismatchResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(mismatchResponse)).resolves.toMatchObject({
      error: { code: "EMAIL_MISMATCH" },
    });

    authenticateAs(owner.id);
    const ownerLeaveResponse = await leaveSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/members/leave`, {
        method: "POST",
      }),
      spaceContext(space.id),
    );
    expect(ownerLeaveResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(ownerLeaveResponse)).resolves.toMatchObject({
      error: { code: "OWNERSHIP_TRANSFER_REQUIRED" },
    });

    const soloOwner = await createUser({ email: "solo-owner@orbit.test" });
    const soloSpace = await createSpaceWithSystemSections(testDb, {
      name: "Solo",
      ownerUserId: soloOwner.id,
    });
    authenticateAs(soloOwner.id);
    const lastSpaceResponse = await leaveSpaceRoute(
      new Request(
        `http://localhost/api/v1/spaces/${soloSpace.space.id}/members/leave`,
        { method: "POST" },
      ),
      spaceContext(soloSpace.space.id),
    );
    expect(lastSpaceResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(lastSpaceResponse)).resolves.toMatchObject({
      error: { code: "LAST_SPACE" },
    });

    const emptyOwner = await createUser({ email: "empty-owner@orbit.test" });
    const emptyHome = await createSpaceWithSystemSections(testDb, {
      name: "Empty Home",
      ownerUserId: emptyOwner.id,
    });
    await createSpaceWithSystemSections(testDb, {
      name: "Empty Other",
      ownerUserId: emptyOwner.id,
    });
    authenticateAs(emptyOwner.id);
    const cannotLeaveResponse = await leaveSpaceRoute(
      new Request(
        `http://localhost/api/v1/spaces/${emptyHome.space.id}/members/leave`,
        { method: "POST" },
      ),
      spaceContext(emptyHome.space.id),
    );
    expect(cannotLeaveResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(cannotLeaveResponse)).resolves.toMatchObject({
      error: { code: "OWNER_CANNOT_LEAVE" },
    });
  });
});
