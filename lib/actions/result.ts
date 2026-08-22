import { z } from "zod";

import { formatZodIssues, type ApiValidationIssue } from "@/lib/api/errors";
import { DomainError } from "@/lib/domain-error";

export interface ActionErrorBody {
  code: string;
  message: string;
  issues?: ApiValidationIssue[];
}

export interface ActionSuccess<TData> {
  ok: true;
  data: TData;
}

export interface ActionFailure {
  ok: false;
  error: ActionErrorBody;
}

/**
 * Every Server Action resolves to this shape instead of throwing, so forms
 * can render errors inline. The session guard's redirect is the one
 * intentional throw and must stay outside each action's try/catch.
 */
export type ActionResult<TData> = ActionSuccess<TData> | ActionFailure;

function actionFailure(
  code: string,
  message: string,
  issues?: readonly ApiValidationIssue[],
): ActionFailure {
  const error: ActionErrorBody = { code, message };
  if (issues?.length) {
    error.issues = [...issues];
  }
  return { ok: false, error };
}

/**
 * Maps domain failures to a serializable action error. Error codes match the
 * `/api/v1` envelope because both boundaries wrap the same services.
 * Unexpected errors intentionally do not expose their message.
 */
export function toActionError(error: unknown): ActionFailure {
  if (error instanceof z.ZodError) {
    return actionFailure(
      "VALIDATION_ERROR",
      "Input validation failed",
      formatZodIssues(error),
    );
  }

  if (error instanceof DomainError) {
    return actionFailure(error.code, error.message);
  }

  console.error("Unexpected Server Action error:", error);

  return actionFailure("INTERNAL_ERROR", "An unexpected error occurred");
}
