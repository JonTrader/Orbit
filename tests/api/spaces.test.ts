import "../setup/api-mocks";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DELETE as deleteSpaceRoute,
  GET as getSpaceRoute,
  PATCH as patchSpaceRoute,
} from "@/app/api/v1/spaces/[spaceId]/route";
import {
  GET as listSpacesRoute,
  POST as createSpaceRoute,
} from "@/app/api/v1/spaces/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";

import {
  apiTestLifecycle,
  authenticateAs,
  ErrorBody,
  jsonRequest,
  responseJson,
  routeContext,
  unauthenticate,
} from "../setup/api";
import { testDb } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface SpaceBody {
  id: string;
  name: string;
  timezone: string;
}

const { beforeAll: setupBeforeAll, beforeEach: setupBeforeEach } =
  apiTestLifecycle();

describe("Spaces API", () => {
  beforeAll(setupBeforeAll);
  beforeEach(setupBeforeEach);

  it("rejects unauthenticated requests with the shared error envelope", async () => {
    unauthenticate();

    const response = await listSpacesRoute(
      new Request("http://localhost/api/v1/spaces"),
    );

    expect(response.status).toBe(401);
    await expect(responseJson<ErrorBody>(response)).resolves.toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required",
      },
    });
  });

  it("supports authenticated Space CRUD and timezone updates", async () => {
    const owner = await createUser();
    authenticateAs(owner.id);

    const createResponse = await createSpaceRoute(
      jsonRequest("/api/v1/spaces", { name: "  Home  " }),
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<SpaceBody>(createResponse);
    expect(created).toMatchObject({
      name: "Home",
      timezone: "UTC",
    });

    const listResponse = await listSpacesRoute(
      new Request("http://localhost/api/v1/spaces"),
    );
    expect(listResponse.status).toBe(200);
    await expect(responseJson<SpaceBody[]>(listResponse)).resolves.toEqual([
      expect.objectContaining({ id: created.id, name: "Home" }),
    ]);

    const getResponse = await getSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${created.id}`),
      routeContext(created.id),
    );
    expect(getResponse.status).toBe(200);
    await expect(responseJson<SpaceBody>(getResponse)).resolves.toMatchObject({
      id: created.id,
      name: "Home",
    });

    const patchResponse = await patchSpaceRoute(
      jsonRequest(
        `/api/v1/spaces/${created.id}`,
        { timezone: " Europe/London " },
        "PATCH",
      ),
      routeContext(created.id),
    );
    expect(patchResponse.status).toBe(200);
    await expect(responseJson<SpaceBody>(patchResponse)).resolves.toMatchObject({
      id: created.id,
      timezone: "Europe/London",
    });

    const secondCreateResponse = await createSpaceRoute(
      jsonRequest("/api/v1/spaces", {
        name: "Second Space",
        timezone: "America/Chicago",
      }),
    );
    const second = await responseJson<SpaceBody>(secondCreateResponse);

    const deleteResponse = await deleteSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${created.id}`, {
        method: "DELETE",
      }),
      routeContext(created.id),
    );
    expect(deleteResponse.status).toBe(204);
    expect(await deleteResponse.text()).toBe("");

    const remaining = await listSpacesRoute(
      new Request("http://localhost/api/v1/spaces"),
    );
    await expect(responseJson<SpaceBody[]>(remaining)).resolves.toEqual([
      expect.objectContaining({ id: second.id, name: "Second Space" }),
    ]);
  });

  it("keeps collection reads membership-scoped", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const member = await createUser({ email: "member@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Shared",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: space.id,
      userId: member.id,
      role: "read-only",
    });

    authenticateAs(member.id);
    const memberResponse = await listSpacesRoute(
      new Request("http://localhost/api/v1/spaces"),
    );
    await expect(responseJson<SpaceBody[]>(memberResponse)).resolves.toEqual([
      expect.objectContaining({ id: space.id, name: "Shared" }),
    ]);

    authenticateAs(outsider.id);
    const outsiderResponse = await listSpacesRoute(
      new Request("http://localhost/api/v1/spaces"),
    );
    await expect(responseJson<SpaceBody[]>(outsiderResponse)).resolves.toEqual(
      [],
    );
  });

  it("maps non-member and read-only mutations through the API boundary", async () => {
    const owner = await createUser({ email: "owner@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: space.id,
      userId: readOnly.id,
      role: "read-only",
    });

    authenticateAs(outsider.id);
    const nonMemberResponse = await getSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}`),
      routeContext(space.id),
    );
    expect(nonMemberResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(nonMemberResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });

    authenticateAs(readOnly.id);
    const readResponse = await getSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}`),
      routeContext(space.id),
    );
    expect(readResponse.status).toBe(200);

    const mutationResponse = await patchSpaceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}`,
        { timezone: "America/Chicago" },
        "PATCH",
      ),
      routeContext(space.id),
    );
    expect(mutationResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(mutationResponse)).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });
  });

  it("returns 400 for boundary and service validation failures", async () => {
    const owner = await createUser();
    const { space } = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    authenticateAs(owner.id);

    const invalidBodyResponse = await patchSpaceRoute(
      jsonRequest(`/api/v1/spaces/${space.id}`, {}, "PATCH"),
      routeContext(space.id),
    );
    expect(invalidBodyResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidBodyResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const invalidTimezoneResponse = await patchSpaceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}`,
        { timezone: "Not/A-Timezone" },
        "PATCH",
      ),
      routeContext(space.id),
    );
    expect(invalidTimezoneResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidTimezoneResponse)).resolves.toMatchObject({
      error: { code: "INVALID_TIMEZONE" },
    });

    const invalidIdResponse = await getSpaceRoute(
      new Request("http://localhost/api/v1/spaces/not-a-uuid"),
      routeContext("not-a-uuid"),
    );
    expect(invalidIdResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidIdResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("maps the last-Space guard to a conflict response", async () => {
    const owner = await createUser();
    authenticateAs(owner.id);
    const createResponse = await createSpaceRoute(
      jsonRequest("/api/v1/spaces", { name: "Only Space" }),
    );
    const created = await responseJson<SpaceBody>(createResponse);

    const deleteResponse = await deleteSpaceRoute(
      new Request(`http://localhost/api/v1/spaces/${created.id}`, {
        method: "DELETE",
      }),
      routeContext(created.id),
    );

    expect(deleteResponse.status).toBe(409);
    await expect(responseJson<ErrorBody>(deleteResponse)).resolves.toMatchObject({
      error: { code: "LAST_SPACE" },
    });
  });
});
