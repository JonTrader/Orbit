import { z } from "zod";
import { describe, expect, it } from "vitest";

import { MembershipError } from "@/lib/authz";
import {
  apiErrorResponse,
  parseJsonBody,
  parseSearchParams,
  type ApiErrorPayload,
} from "@/lib/api";
import { TaskError } from "@/lib/services/tasks";

async function responseFor(action: () => Promise<unknown>): Promise<Response> {
  try {
    await action();
    throw new Error("Expected the API operation to fail");
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function responseBody(response: Response): Promise<ApiErrorPayload> {
  return (await response.json()) as ApiErrorPayload;
}

describe("API boundary validation and errors", () => {
  it("returns typed data for a valid JSON body", async () => {
    const schema = z.object({
      name: z.string(),
      timezone: z.string().optional(),
    });
    const request = new Request("http://localhost/api/v1/spaces", {
      method: "POST",
      body: JSON.stringify({ name: "Home", timezone: "Europe/London" }),
    });

    await expect(parseJsonBody(request, schema)).resolves.toEqual({
      name: "Home",
      timezone: "Europe/London",
    });
  });

  it("returns one stable 400 envelope for invalid JSON", async () => {
    const request = new Request("http://localhost/api/v1/spaces", {
      method: "POST",
      body: "{not-json",
    });
    const response = await responseFor(() =>
      parseJsonBody(request, z.object({ name: z.string() })),
    );

    expect(response.status).toBe(400);
    await expect(responseBody(response)).resolves.toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
    });
  });

  it("returns Zod issues in the same 400 error envelope", async () => {
    const request = new Request("http://localhost/api/v1/spaces", {
      method: "POST",
      body: JSON.stringify({ name: 42 }),
    });
    const response = await responseFor(() =>
      parseJsonBody(
        request,
        z.object({ name: z.string().min(1), timezone: z.string() }),
      ),
    );

    expect(response.status).toBe(400);
    const body = await responseBody(response);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Request validation failed");
    expect(body.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["name"] }),
        expect.objectContaining({ path: ["timezone"] }),
      ]),
    );
  });

  it("validates URL query parameters at the same boundary", () => {
    const request = new Request(
      "http://localhost/api/v1/tasks?sectionId=section-1&limit=25",
    );

    expect(
      parseSearchParams(
        request,
        z.object({ sectionId: z.string(), limit: z.coerce.number().int() }),
      ),
    ).toEqual({ sectionId: "section-1", limit: 25 });
  });

  it("maps authorization and domain errors without changing the envelope", async () => {
    const authorizationResponse = apiErrorResponse(
      new MembershipError("INSUFFICIENT_ROLE", "Editor access is required"),
    );
    expect(authorizationResponse.status).toBe(403);
    await expect(responseBody(authorizationResponse)).resolves.toEqual({
      error: {
        code: "INSUFFICIENT_ROLE",
        message: "Editor access is required",
      },
    });

    const domainResponse = apiErrorResponse(
      new TaskError("INVALID_SECTION", "Tasks cannot be created there"),
    );
    expect(domainResponse.status).toBe(400);
    await expect(responseBody(domainResponse)).resolves.toEqual({
      error: {
        code: "INVALID_SECTION",
        message: "Tasks cannot be created there",
      },
    });
  });

  it("does not expose unexpected error details", async () => {
    const response = apiErrorResponse(
      new Error("database password and provider details"),
    );

    expect(response.status).toBe(500);
    await expect(responseBody(response)).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });
});
