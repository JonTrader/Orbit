import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { MembershipError } from "@/lib/spaces/membership";
import {
  apiErrorResponse,
  type ApiErrorPayload,
} from "@/lib/rest-api/errors";
import { parseJsonBody, parseSearchParams } from "@/lib/rest-api/validation";
import { MemberError } from "@/lib/services/members";
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

  it("maps domain error codes to their statuses", async () => {
    const notFoundResponse = apiErrorResponse(
      new TaskError("TASK_NOT_FOUND", "That Task does not exist"),
    );
    expect(notFoundResponse.status).toBe(404);

    const conflictResponse = apiErrorResponse(
      new MemberError("ALREADY_MEMBER", "They are already a Member"),
    );
    expect(conflictResponse.status).toBe(409);

    const expiredResponse = apiErrorResponse(
      new MemberError("EXPIRED_INVITE", "Invite has expired"),
    );
    expect(expiredResponse.status).toBe(410);
    await expect(responseBody(expiredResponse)).resolves.toEqual({
      error: {
        code: "EXPIRED_INVITE",
        message: "Invite has expired",
      },
    });
  });

  it("treats non-domain errors as unexpected even when they look like domain errors", async () => {
    const lookalike = Object.assign(new Error("Almost a TaskError"), {
      name: "TaskError",
      code: "TASK_NOT_FOUND",
    });
    const response = apiErrorResponse(lookalike);

    expect(response.status).toBe(500);
    await expect(responseBody(response)).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  it("does not expose unexpected error details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
