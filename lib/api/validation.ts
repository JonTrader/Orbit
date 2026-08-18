import { z } from "zod";

import { ApiError, validationError } from "./errors";

/** Parses an unknown boundary value with a Zod schema. */
export function validateInput<TSchema extends z.ZodType>(
  value: unknown,
  schema: TSchema,
): z.infer<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** Reads and validates a JSON request body without leaking parser details. */
export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  return validateInput(body, schema);
}

/** Reads URL query parameters and validates them with a Zod schema. */
export function parseSearchParams<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return validateInput(params, schema);
}
