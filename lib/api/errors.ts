import { z } from "zod";

import { MembershipError } from "@/lib/authz";

export type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 422
  | 429
  | 500;
export type ApiErrorPathSegment = string | number;

export interface ApiValidationIssue {
  path: ApiErrorPathSegment[];
  message: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    issues?: ApiValidationIssue[];
  };
}

/** An error that is safe for an API Route Handler to expose to its caller. */
export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly status: ApiErrorStatus,
    readonly code: string,
    message: string,
    readonly issues?: readonly ApiValidationIssue[],
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Converts Zod's issue format into the stable API validation shape. */
export function formatZodIssues(
  error: z.ZodError,
): ApiValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment),
    ),
    message: issue.message,
  }));
}

export function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed",
    formatZodIssues(error),
  );
}

export function unauthenticatedError(
  message = "Authentication is required",
): ApiError {
  return new ApiError(401, "UNAUTHENTICATED", message);
}

export function forbiddenError(message = "You are not allowed to perform this operation"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

/**
 * Normalizes errors at the HTTP boundary. Unexpected errors intentionally do
 * not expose their message, which keeps database and provider details private.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError) return validationError(error);

  if (error instanceof MembershipError) {
    return new ApiError(403, error.code, error.message);
  }

  const domainError = getKnownDomainError(error);
  if (domainError) return domainError;

  return new ApiError(
    500,
    "INTERNAL_ERROR",
    "An unexpected error occurred",
  );
}

/** Returns a JSON response with the same envelope for every API error. */
export function apiErrorResponse(error: unknown): Response {
  const normalized = toApiError(error);
  const payload: ApiErrorPayload = {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };

  if (normalized.issues?.length) {
    payload.error.issues = [...normalized.issues];
  }

  return Response.json(payload, { status: normalized.status });
}

const KNOWN_DOMAIN_ERROR_NAMES = new Set([
  "MemberError",
  "MonthlyError",
  "NoteError",
  "SectionError",
  "SpaceError",
  "TaskError",
]);

const NOT_FOUND_CODES = new Set([
  "INVITE_NOT_FOUND",
  "MEMBER_NOT_FOUND",
  "MONTHLIES_SECTION_NOT_FOUND",
  "MONTHLY_NOT_FOUND",
  "NOTE_NOT_FOUND",
  "SECTION_NOT_FOUND",
  "SPACE_NOT_FOUND",
  "TASK_NOT_FOUND",
]);

const CONFLICT_CODES = new Set([
  "ALREADY_MEMBER",
  "INVALID_REORDER",
  "LAST_SPACE",
  "OWNER_CANNOT_LEAVE",
  "OWNERSHIP_TRANSFER_REQUIRED",
  "SYSTEM_SECTION",
]);

function getKnownDomainError(error: unknown): ApiError | undefined {
  if (!(error instanceof Error) || !KNOWN_DOMAIN_ERROR_NAMES.has(error.name)) {
    return undefined;
  }

  const code = (error as Error & { code?: unknown }).code;
  if (typeof code !== "string") return undefined;

  return new ApiError(
    statusForDomainError(code),
    code,
    error.message,
  );
}

function statusForDomainError(code: string): ApiErrorStatus {
  if (code === "EXPIRED_INVITE") return 410;
  if (NOT_FOUND_CODES.has(code)) return 404;
  if (CONFLICT_CODES.has(code)) return 409;
  return 400;
}
