import "../setup/api-mocks";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as getPreferenceRoute,
  PATCH as updatePreferenceRoute,
} from "@/app/api/v1/spaces/[spaceId]/notification-preferences/route";
import { createSpaceWithSystemSections } from "@/lib/db/seed";
import { spaceMember } from "@/lib/db/schema";

import {
  apiTestLifecycle,
  authenticateAs,
  ErrorBody,
  jsonRequest,
  responseJson,
  spaceContext,
  unauthenticate,
} from "../setup/api";
import { testDb } from "../setup/db";
import { createUser } from "../setup/fixtures";

interface PreferenceBody {
  id: string;
  userId: string;
  spaceId: string;
  daysBefore: number;
  emailEnabled: boolean;
}

const { beforeAll: setupBeforeAll, beforeEach: setupBeforeEach } =
  apiTestLifecycle();

describe("Notification preferences API", () => {
  beforeAll(setupBeforeAll);
  beforeEach(setupBeforeEach);

  async function seedSpace() {
    const owner = await createUser({ email: "owner@orbit.test" });
    const readOnly = await createUser({ email: "read-only@orbit.test" });
    const outsider = await createUser({ email: "outsider@orbit.test" });
    const seeded = await createSpaceWithSystemSections(testDb, {
      name: "Home",
      ownerUserId: owner.id,
    });
    await testDb.insert(spaceMember).values({
      spaceId: seeded.space.id,
      userId: readOnly.id,
      role: "read-only",
    });

    return { owner, readOnly, outsider, ...seeded };
  }

  it("rejects unauthenticated preference reads with the shared error envelope", async () => {
    unauthenticate();

    const response = await getPreferenceRoute(
      new Request(
        "http://localhost/api/v1/spaces/00000000-0000-0000-0000-000000000000/notification-preferences",
      ),
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

  it("returns defaults and updates preferences per user and Space", async () => {
    const { owner, readOnly, space } = await seedSpace();
    authenticateAs(readOnly.id);

    const defaultResponse = await getPreferenceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notification-preferences`),
      spaceContext(space.id),
    );
    expect(defaultResponse.status).toBe(200);
    const defaults = await responseJson<PreferenceBody>(defaultResponse);
    expect(defaults).toMatchObject({
      userId: readOnly.id,
      spaceId: space.id,
      daysBefore: 3,
      emailEnabled: true,
    });

    const updateResponse = await updatePreferenceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notification-preferences`,
        { daysBefore: 5, emailEnabled: false },
      ),
      spaceContext(space.id),
    );
    expect(updateResponse.status).toBe(200);
    await expect(responseJson<PreferenceBody>(updateResponse)).resolves.toMatchObject({
      id: defaults.id,
      userId: readOnly.id,
      daysBefore: 5,
      emailEnabled: false,
    });

    const roundTripResponse = await getPreferenceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notification-preferences`),
      spaceContext(space.id),
    );
    await expect(responseJson<PreferenceBody>(roundTripResponse)).resolves.toMatchObject({
      userId: readOnly.id,
      daysBefore: 5,
      emailEnabled: false,
    });

    authenticateAs(owner.id);
    const ownerResponse = await getPreferenceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notification-preferences`),
      spaceContext(space.id),
    );
    const ownerPreference = await responseJson<PreferenceBody>(ownerResponse);
    expect(ownerPreference).toMatchObject({
      userId: owner.id,
      daysBefore: 3,
      emailEnabled: true,
    });
    expect(ownerPreference.id).not.toBe(defaults.id);
  });

  it("allows Member reads and own preference updates but rejects non-member access", async () => {
    const { outsider, readOnly, space } = await seedSpace();
    authenticateAs(readOnly.id);

    const updateResponse = await updatePreferenceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notification-preferences`,
        { emailEnabled: false },
      ),
      spaceContext(space.id),
    );
    expect(updateResponse.status).toBe(200);

    authenticateAs(outsider.id);
    const readResponse = await getPreferenceRoute(
      new Request(`http://localhost/api/v1/spaces/${space.id}/notification-preferences`),
      spaceContext(space.id),
    );
    expect(readResponse.status).toBe(403);
    await expect(responseJson<ErrorBody>(readResponse)).resolves.toMatchObject({
      error: { code: "NOT_MEMBER" },
    });

    const updateNonMemberResponse = await updatePreferenceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notification-preferences`,
        { daysBefore: 2 },
      ),
      spaceContext(space.id),
    );
    expect(updateNonMemberResponse.status).toBe(403);
  });

  it("returns boundary validation and preference errors through the API envelope", async () => {
    const { readOnly, space } = await seedSpace();
    authenticateAs(readOnly.id);

    const invalidSpaceResponse = await getPreferenceRoute(
      new Request(
        "http://localhost/api/v1/spaces/not-a-uuid/notification-preferences",
      ),
      spaceContext("not-a-uuid"),
    );
    expect(invalidSpaceResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidSpaceResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    for (const daysBefore of [-1, 31, 1.5]) {
      const invalidDaysResponse = await updatePreferenceRoute(
        jsonRequest(
          `/api/v1/spaces/${space.id}/notification-preferences`,
          { daysBefore },
        ),
        spaceContext(space.id),
      );
      expect(invalidDaysResponse.status).toBe(400);
      await expect(responseJson<ErrorBody>(invalidDaysResponse)).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }

    const invalidBooleanResponse = await updatePreferenceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notification-preferences`,
        { emailEnabled: "false" },
      ),
      spaceContext(space.id),
    );
    expect(invalidBooleanResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(invalidBooleanResponse)).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const emptyUpdateResponse = await updatePreferenceRoute(
      jsonRequest(
        `/api/v1/spaces/${space.id}/notification-preferences`,
        {},
      ),
      spaceContext(space.id),
    );
    expect(emptyUpdateResponse.status).toBe(400);
    await expect(responseJson<ErrorBody>(emptyUpdateResponse)).resolves.toMatchObject({
      error: { code: "INVALID_UPDATE" },
    });
  });
});
